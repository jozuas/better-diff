import * as fc from "fast-check";
import { expect, test } from "vitest";

import { applyFileRpc, applyLinesRpc, diffRpc } from "../shared/diff";
import { fileVersions } from "../test/file-contents";
import { inRepository, runGit, runGitBytes, timeout, writeFile } from "../test/repository";
import {
  diffCommands,
  file,
  fileState,
  linesOf,
  operations,
  setUp,
  sides,
  targets,
  writeVersion,
} from "../test/staging";
import type { Diff } from "../test/staging";
import { applyFile, applyLines, readDiff } from "./diff";

test.each(operations)(
  "%s nothing when the diff has changed since it was read",
  async (operation) => {
    await fc.assert(
      fc.asyncProperty(file, fileVersions, async ({ path, versions }, later) => {
        await inRepository(async (repository) => {
          setUp(repository, [{ path, versions }], "myers");

          const side = sides[operation];
          const diffArgs = [...diffCommands[side], "--", path];
          const diff = await readDiff({ directory: repository, path, side });
          const shown = runGitBytes(repository, diffArgs);

          writeVersion(repository, path, later.index);
          runGit(repository, ["add", "--all"]);
          writeVersion(repository, path, later.worktree);
          fc.pre(!runGitBytes(repository, diffArgs).equals(shown));

          const before = fileState(repository, path);

          const action = { directory: repository, path, operation, version: diff.version };

          await expect(
            applyLines({ ...action, lines: linesOf(diff, () => true) }),
          ).resolves.toStrictEqual({ status: "stale" });
          await expect(applyFile(action)).resolves.toStrictEqual({ status: "stale" });

          expect(fileState(repository, path)).toStrictEqual(before);
        });
      }),
      { numRuns: 30 },
    );
  },
  timeout,
);

type Line = Diff["hunks"][number]["lines"][number];

function line(kind: Line["kind"], text: string, newline = true): Line {
  return { kind, text, newline };
}

test("reads each hunk's lines as text, with where the hunk starts in each version", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "1\n2\n3\n4\n5\n6\n7\n8\n9\nb");
    runGit(repository, ["add", "--all"]);
    // The last line has é, a byte that isn't UTF-8, and the `\r` of a CRLF line.
    writeFile(
      repository,
      "a",
      Buffer.concat([
        Buffer.from("1\nx\n2\n3\n4\n5\n6\n7\n8\n9\né"),
        Buffer.from([0xff, 0x0d, 0x0a]),
      ]),
    );

    const { hunks } = await readDiff({ directory: repository, path: "a", side: "unstaged" });

    expect(hunks).toStrictEqual([
      {
        oldStart: 1,
        newStart: 1,
        lines: [
          line("context", "1"),
          line("added", "x"),
          line("context", "2"),
          line("context", "3"),
          line("context", "4"),
        ],
      },
      {
        oldStart: 7,
        newStart: 8,
        lines: [
          line("context", "7"),
          line("context", "8"),
          line("context", "9"),
          line("removed", "b", false),
          line("added", "é\uFFFD\r"),
        ],
      },
    ]);
  });
});

test.each([
  ["past the end of its hunk", { hunk: 0, line: 2 }],
  ["in a hunk the diff doesn't have", { hunk: 1, line: 0 }],
])("rejects a line %s, changes nothing, and applies the next", async (_, selected) => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    runGit(repository, ["add", "--all"]);
    writeFile(repository, "a", "b\n");

    const { version } = await readDiff({ directory: repository, path: "a", side: "unstaged" });
    const before = fileState(repository, "a");

    await expect(
      applyLines({
        directory: repository,
        path: "a",
        operation: "stage",
        version,
        lines: [{ hunk: 0, line: 0 }, selected],
      }),
    ).rejects.toThrow(`The diff has no line ${selected.line} in hunk ${selected.hunk}.`);

    expect(fileState(repository, "a")).toStrictEqual(before);

    await expect(
      applyLines({
        directory: repository,
        path: "a",
        operation: "stage",
        version,
        lines: [{ hunk: 0, line: 0 }],
      }),
    ).resolves.toStrictEqual({ status: "applied" });
  });
});

test.each(operations)(
  "%s answers the same through the RPCs' input and output validation",
  async (operation) => {
    await inRepository(async (repository) => {
      // Both diffs have unchanged, removed and added lines.
      setUp(
        repository,
        [
          {
            path: "a",
            versions: {
              head: Buffer.from("a\nb\nc\n"),
              index: Buffer.from("a\nB\nc\n"),
              worktree: Buffer.from("a\nB\nC\n"),
            },
          },
        ],
        "myers",
      );

      const input = { directory: repository, path: "a", side: sides[operation] };
      const diff = await readDiff(input);

      expect(diffRpc.output.parse(await readDiff(diffRpc.input.parse(input)))).toStrictEqual(diff);

      const applied = await applyLines(
        applyLinesRpc.input.parse({
          directory: repository,
          path: "a",
          operation,
          version: diff.version,
          lines: linesOf(diff, () => true),
        }),
      );

      expect(applyLinesRpc.output.parse(applied)).toStrictEqual({ status: "applied" });

      // The diff has changed since it was read.
      const stale = await applyFile(
        applyFileRpc.input.parse({
          directory: repository,
          path: "a",
          operation,
          version: diff.version,
        }),
      );

      expect(applyFileRpc.output.parse(stale)).toStrictEqual({ status: "stale" });
    });
  },
);

// Twenty identical lines, and the same with a distinct line inserted near the top and another near
// the bottom, far enough apart to make two hunks.
const repeated = "a\n".repeat(20);
const withInserted = `${"a\n".repeat(2)}X\n${"a\n".repeat(13)}Y\n${"a\n".repeat(5)}`;

// Versions in which each operation makes the target version `withInserted`.
const insertions = [
  ["stage", { head: repeated, index: repeated, worktree: withInserted }],
  ["unstage", { head: withInserted, index: repeated, worktree: repeated }],
  ["discard", { head: repeated, index: withInserted, worktree: repeated }],
] as const;

function setUpFile(
  repository: string,
  versions: { head: string; index: string; worktree: string },
): void {
  setUp(
    repository,
    [
      {
        path: "a",
        versions: {
          head: Buffer.from(versions.head),
          index: Buffer.from(versions.index),
          worktree: Buffer.from(versions.worktree),
        },
      },
    ],
    "myers",
  );
}

test.each(insertions)(
  "%s a hunk after one that changes the line count where the lines around it repeat",
  async (operation, versions) => {
    await inRepository(async (repository) => {
      setUpFile(repository, versions);

      const diff = await readDiff({ directory: repository, path: "a", side: sides[operation] });

      await applyLines({
        directory: repository,
        path: "a",
        operation,
        version: diff.version,
        lines: linesOf(diff, () => true),
      });

      expect(diff.hunks).toHaveLength(2);
      expect(fileState(repository, "a")[targets[operation]]?.toString()).toBe(withInserted);
    });
  },
);

test.each(insertions)(
  "%s refuses a second apply of a diff, by its lines or as a file, that starts before the first ends",
  async (operation, versions) => {
    await inRepository(async (repository) => {
      setUpFile(repository, versions);

      const diff = await readDiff({ directory: repository, path: "a", side: sides[operation] });

      const input = {
        directory: repository,
        path: "a",
        operation,
        version: diff.version,
        lines: linesOf(diff, () => true),
      };

      await expect(
        Promise.all([applyLines(input), applyLines(input), applyFile(input)]),
      ).resolves.toStrictEqual([{ status: "applied" }, { status: "stale" }, { status: "stale" }]);

      expect(fileState(repository, "a")[targets[operation]]?.toString()).toBe(withInserted);
    });
  },
);

test("discards a hunk of 50,000 lines, as changing a long file's line endings makes", async () => {
  await inRepository(async (repository) => {
    const numbers = Array.from({ length: 25_000 }, (_, number) => String(number));
    const lf = numbers.map((number) => `${number}\n`).join("");

    setUpFile(repository, {
      head: lf,
      index: lf,
      worktree: numbers.map((number) => `${number}\r\n`).join(""),
    });

    const diff = await readDiff({ directory: repository, path: "a", side: "unstaged" });

    await applyLines({
      directory: repository,
      path: "a",
      operation: "discard",
      version: diff.version,
      lines: linesOf(diff, () => true),
    });

    expect(fileState(repository, "a").worktree?.toString()).toBe(lf);
  });
});
