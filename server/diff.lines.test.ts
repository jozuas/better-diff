import * as fc from "fast-check";
import { expect, test } from "vitest";

import { inRepository, runGitBytes, timeout } from "../test/repository";
import {
  diffAlgorithm,
  diffCommands,
  file,
  fileState,
  operations,
  setUp,
  sides,
  targets,
} from "../test/staging";
import type { Diff, Operation, Selection, Side } from "../test/staging";
import { applyLines, readDiff } from "./diff";

type Line = Diff["hunks"][number]["lines"][number];

interface DiffLine {
  prefix: string;
  bytes: Buffer;
  newline: boolean;
}

// Every line of the file's diff, unchanged ones included, as git prints them with more lines of
// context than the file has.
function fullDiff(repository: string, path: string, side: Side): DiffLine[] {
  const diff = runGitBytes(repository, [...diffCommands[side], "--unified=1000000", "--", path]);

  // Latin-1 reads each byte as one character, so bytes that aren't UTF-8 survive.
  const output = diff.toString("latin1").split("\n");
  // The lines after the one hunk's start, without the empty string after the last newline.
  const hunk = output.slice(output.findIndex((line) => line.startsWith("@@")) + 1, -1);
  const lines: DiffLine[] = [];

  for (const line of hunk) {
    const previous = lines.at(-1);

    if (line.startsWith("\\") && previous !== undefined) {
      previous.newline = false;
    } else {
      lines.push({
        prefix: line.charAt(0),
        bytes: Buffer.from(line.slice(1), "latin1"),
        newline: true,
      });
    }
  }

  return lines;
}

// The file with only the selected changes made, when staging, or undone, when unstaging or
// discarding. Its lines are the unchanged ones, the removed ones whose removal isn't made and the
// added ones whose addition is. Only its last line can lack a newline, if it lacked one where it
// came from.
function withSelectedChanges(
  lines: readonly DiffLine[],
  selected: readonly boolean[],
  operation: Operation,
): Buffer {
  const selection = selected.values();
  const kept: DiffLine[] = [];

  for (const line of lines) {
    if (line.prefix === " ") {
      kept.push(line);
    } else {
      // Unstaging and discarding undo the selected changes, which leaves the others made.
      const made = (selection.next().value === true) === (operation === "stage");

      if ((line.prefix === "+") === made) {
        kept.push(line);
      }
    }
  }

  return Buffer.concat(
    kept.flatMap(({ bytes, newline }, index) =>
      newline || index < kept.length - 1 ? [bytes, Buffer.from("\n")] : [bytes],
    ),
  );
}

// Each changed line of git's diff, as the plugin shows it.
function asShown(lines: readonly DiffLine[]): Line[] {
  return lines.flatMap(({ prefix, bytes, newline }) =>
    prefix === " "
      ? []
      : [{ kind: prefix === "-" ? "removed" : "added", text: bytes.toString("utf8"), newline }],
  );
}

function changedLines(diff: Diff): Line[] {
  return diff.hunks.flatMap(({ lines }) => lines.filter(({ kind }) => kind !== "context"));
}

function selectedLines(diff: Diff, isSelected: (hunk: number, line: number) => boolean): Selection {
  return diff.hunks.flatMap(({ lines }, hunk) =>
    lines.flatMap((_, line) => (isSelected(hunk, line) ? [{ hunk, line }] : [])),
  );
}

// Whether each changed line, in order, is selected.
function selectedChanges(
  diff: Diff,
  isSelected: (hunk: number, line: number) => boolean,
): boolean[] {
  return diff.hunks.flatMap(({ lines }, hunk) =>
    lines.flatMap(({ kind }, line) => (kind === "context" ? [] : [isSelected(hunk, line)])),
  );
}

test.each(operations)(
  "%s lines: makes or undoes exactly the selected changes",
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
            const diff = await readDiff({ directory: repository, path, side });
            const changes = fullDiff(repository, path, side);

            // With nothing changed, git prints no diff to work out the file from. The hunk
            // property covers that case.
            fc.pre(changes.length > 0);

            // Every change is shown, so every change can be selected.
            expect(changedLines(diff)).toStrictEqual(asShown(changes));

            const before = fileState(repository, path);

            const changed = withSelectedChanges(
              changes,
              selectedChanges(diff, isSelected),
              operation,
            );

            await applyLines({
              directory: repository,
              path,
              operation,
              version: diff.version,
              lines: selectedLines(diff, isSelected),
            });

            expect(fileState(repository, path)).toStrictEqual({
              ...before,
              [targets[operation]]: changed,
            });
          });
        },
      ),
      { numRuns: 30 },
    );
  },
  timeout,
);
