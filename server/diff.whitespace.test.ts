import * as fc from "fast-check";
import { expect, test } from "vitest";

import { applyLinesRpc } from "../shared/diff";
import type { FileVersions } from "../test/file-contents";
import {
  addedLines,
  asShown,
  changedLines,
  diffVersions,
  fullDiff,
  selectedChanges,
  withSelectedChanges,
} from "../test/full-diff";
import type { DiffLine } from "../test/full-diff";
import { commitAll, inRepository, timeout, writeFile } from "../test/repository";
import {
  diffAlgorithm,
  file,
  fileState,
  linesOf,
  operations,
  selectedLines,
  setUp,
  sides,
  targets,
} from "../test/staging";
import type { File, FileState, Operation } from "../test/staging";
import { applyLines, readDiff } from "./diff";

type Status = Awaited<ReturnType<typeof applyLines>>["status"];

// git's diff with whitespace changes hidden, each unchanged line as the version the operation
// changes has it, where git prints the new version's, which can differ from it in whitespace.
function asActedOn(
  lines: readonly DiffLine[],
  operation: Operation,
  versions: FileVersions,
): DiffLine[] {
  const [from, to] = diffVersions[sides[operation]];
  const base = addedLines(versions[operation === "stage" ? from : to]);
  let old = 0;
  let changed = 0;

  return lines.map((line) => {
    old += line.prefix === "+" ? 0 : 1;
    changed += line.prefix === "-" ? 0 : 1;

    if (line.prefix !== " ") {
      return line;
    }

    const kept = base[(operation === "stage" ? old : changed) - 1];

    if (kept === undefined) {
      throw new Error("git's diff has more unchanged lines than the version.");
    }

    return { ...kept, prefix: " " };
  });
}

// What acting on lines can answer, from git's diff with whitespace changes hidden and its diff
// without hiding them: refused as misaligned only where they differ, and not where git prints no
// lines to select, as for a file whose changes are all to whitespace.
function answers(shown: readonly DiffLine[], full: readonly DiffLine[]): Status[] {
  return shown.length === 0 || JSON.stringify(shown) === JSON.stringify(full)
    ? ["applied"]
    : ["applied", "misaligned"];
}

interface Acted {
  status: Status;
  operation: Operation;
  versions: FileVersions;
  // git's diff with whitespace changes hidden.
  shown: readonly DiffLine[];
  // Whether each of its changes, in order, was selected.
  selected: readonly boolean[];
}

// The file once the operation acted on the selected lines of its diff with whitespace changes
// hidden: as it was, unless they were applied, and else with the changes selected made or undone,
// and the lines unchanged as they were.
function expectedState(
  before: FileState,
  { status, operation, versions, shown, selected }: Acted,
): FileState {
  if (status !== "applied" || shown.length === 0) {
    return before;
  }

  const changed = withSelectedChanges(
    asActedOn(shown, operation, versions),
    selected,
    operation,
    versions,
  );

  return { ...before, [targets[operation]]: changed };
}

const indented = Buffer.from("a\n  b\nc\nd\n");
const tabbed = Buffer.from("a\n\tb\nc\nD\n");

// Cases a fixed seed can miss. A whitespace change beside another in each diff, all selected. Lines
// that only differ in whitespace, which git lines up otherwise with whitespace changes hidden,
// where line 1 is a change only then: removed, or added last, which staging leaves one line fewer
// of without hiding them.
const examples: [File, "myers", (hunk: number, line: number) => boolean][] = [
  [
    {
      path: "a",
      versions: { head: indented, index: tabbed, worktree: Buffer.from("a\n \tb\nc\nE\n") },
    },
    "myers",
    () => true,
  ],
  [
    {
      path: "a",
      versions: {
        head: Buffer.from("  y\ny\nz\n"),
        index: Buffer.from("y\nz\n"),
        worktree: Buffer.from("  y\ny\nz\n"),
      },
    },
    "myers",
    (_, line) => line === 1,
  ],
  [
    {
      path: "a",
      versions: {
        head: Buffer.from("x\n"),
        index: Buffer.from("x\n"),
        worktree: Buffer.from(" x\nx\n"),
      },
    },
    "myers",
    (_, line) => line === 1,
  ],
];

test.each(operations)(
  "with whitespace changes hidden, %s lines makes or undoes exactly the selected changes shown, or nothing where git lines up the versions otherwise without hiding them",
  async (operation) => {
    await fc.assert(
      fc.asyncProperty(
        file,
        diffAlgorithm,
        fc.func(fc.boolean()),
        async ({ path, versions }, algorithm, isSelected) => {
          await inRepository(async (repository) => {
            setUp(repository, [{ path, versions }], algorithm);

            const side = sides[operation];
            const read = { directory: repository, path, side, hideWhitespace: true };
            const diff = await readDiff(read);
            const shown = fullDiff(repository, path, side, versions, ["--ignore-all-space"]);

            expect(changedLines(diff)).toStrictEqual(asShown(shown));

            const before = fileState(repository, path);

            const { status } = await applyLines({
              ...read,
              operation,
              version: diff.version,
              lines: selectedLines(diff, isSelected),
            });

            const selected = selectedChanges(diff, isSelected);

            expect(answers(shown, fullDiff(repository, path, side, versions))).toContain(status);
            expect(fileState(repository, path)).toStrictEqual(
              expectedState(before, { status, operation, versions, shown, selected }),
            );
          });
        },
      ),
      { numRuns: 30, examples },
    );
  },
  timeout,
);

// Each operation's diff indents a line with a tab where it had two spaces, and changes the last.
const hunks = [
  ["stage", { head: indented, index: indented, worktree: tabbed }, "a\n  b\nc\nD\n"],
  ["unstage", { head: indented, index: tabbed, worktree: tabbed }, "a\n\tb\nc\nd\n"],
  ["discard", { head: indented, index: indented, worktree: tabbed }, "a\n\tb\nc\nd\n"],
] as const;

test.each(hunks)(
  "with whitespace changes hidden, %s a hunk acts only on the changes shown",
  async (operation, versions, changed) => {
    await inRepository(async (repository) => {
      setUp(repository, [{ path: "a", versions }], "myers");

      const read = { directory: repository, path: "a", side: sides[operation] };
      const diff = await readDiff({ ...read, hideWhitespace: true });
      const before = fileState(repository, "a");

      await expect(
        applyLines({
          ...read,
          operation,
          version: diff.version,
          lines: linesOf(diff, () => true),
          hideWhitespace: true,
        }),
      ).resolves.toStrictEqual({ status: "applied" });
      expect(fileState(repository, "a")).toStrictEqual({
        ...before,
        [targets[operation]]: Buffer.from(changed),
      });
    });
  },
);

test.each(["stage", "discard"] as const)(
  "with whitespace changes hidden, %s lines git lines up otherwise without hiding them changes nothing",
  async (operation) => {
    await inRepository(async (repository) => {
      writeFile(repository, "a", "  y\ny\nz\n");
      commitAll(repository);
      writeFile(repository, "a", "y\nz\n");

      const read = {
        directory: repository,
        path: "a",
        side: "unstaged",
        hideWhitespace: true,
      } as const;

      const diff = await readDiff(read);

      expect(diff.hunks[0]?.lines).toStrictEqual([
        { kind: "context", text: "y", newline: true, runs: [] },
        { kind: "removed", text: "y", newline: true, runs: [] },
        { kind: "context", text: "z", newline: true, runs: [] },
      ]);

      const before = fileState(repository, "a");

      const answer = await applyLines({
        ...read,
        operation,
        version: diff.version,
        lines: [{ hunk: 0, line: 1 }],
      });

      expect(applyLinesRpc.output.parse(answer)).toStrictEqual({ status: "misaligned" });
      expect(fileState(repository, "a")).toStrictEqual(before);
    });
  },
);
