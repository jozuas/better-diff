import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { FileVersions } from "../test/file-contents";
import { commitTenLines, tenLines } from "../test/renames";
import {
  diffNoIndex,
  inRepository,
  runGit,
  runGitBytes,
  timeout,
  writeFile,
} from "../test/repository";
import { diffAlgorithm, diffCommands, file, setUp } from "../test/staging";
import type { Diff, File, Side } from "../test/staging";
import { readDiff } from "./diff";

const sides: Side[] = ["unstaged", "staged"];

// The version each side's diff goes to.
const diffedTo: Record<Side, keyof FileVersions> = { unstaged: "worktree", staged: "index" };

// git's own diff of the file on the side, with its default three lines of context. git diff leaves
// out an untracked file, which `git diff --no-index` diffs as new.
function gitsDiff(repository: string, path: string, side: Side, versions: FileVersions): string {
  const diff =
    side === "unstaged" && versions.index === undefined && versions.worktree !== undefined
      ? diffNoIndex(repository, "/dev/null", path)
      : runGitBytes(repository, [...diffCommands[side], "--", path]);

  // Latin-1 reads each byte as one character, so bytes that aren't UTF-8 survive.
  return diff.toString("latin1");
}

type Line = Diff["hunks"][number]["lines"][number];

function kindOf(prefix: string): Line["kind"] {
  if (prefix === "-") {
    return "removed";
  }

  return prefix === "+" ? "added" : "context";
}

// The hunks of git's diff, each started by a line that starts with `@@`, which no line of a hunk
// does, as each starts with " ", "-" or "+". Their lines have no runs, in a file whose name the
// highlighter knows no language by.
function hunksOf(diff: string): Diff["hunks"] {
  const hunks: Diff["hunks"] = [];

  for (const line of diff.split("\n").slice(0, -1)) {
    const start = /^@@ -(?<old>\d+)(?:,\d+)? \+(?<new>\d+)(?:,\d+)? @@/u.exec(line)?.groups;
    const hunk = hunks.at(-1);
    const previous = hunk?.lines.at(-1);

    if (start !== undefined) {
      hunks.push({ oldStart: Number(start["old"]), newStart: Number(start["new"]), lines: [] });
    } else if (line.startsWith("\\") && previous !== undefined) {
      previous.newline = false;
    } else if (hunk !== undefined) {
      hunk.lines.push({
        kind: kindOf(line.charAt(0)),
        text: Buffer.from(line.slice(1), "latin1").toString("utf8"),
        newline: true,
        runs: [],
      });
    }
  }

  return hunks;
}

// The version's lines, without their newlines, decoded as the diff's lines are. A version without
// the file has none.
function linesOf(version: Buffer | undefined): string[] {
  const lines = (version ?? Buffer.alloc(0)).toString("latin1").split("\n");

  return (lines.at(-1) === "" ? lines.slice(0, -1) : lines).map((line) =>
    Buffer.from(line, "latin1").toString("utf8"),
  );
}

// A text diff's contents are the lines of the version it goes to, without runs in a file whose
// name the highlighter knows no language by, and another kind's are none.
function expectedContents(
  kind: Diff["kind"],
  side: Side,
  versions: FileVersions,
): Diff["contents"] {
  return kind === "text"
    ? linesOf(versions[diffedTo[side]]).map((text) => ({ text, runs: [] }))
    : [];
}

// Changes with six unchanged lines between them, which git puts in one hunk, and with seven, which
// it puts in two.
function apart(lines: number): File {
  const middle = "a\n".repeat(lines);

  return {
    path: "a",
    versions: {
      head: Buffer.from(`a\n${middle}a\n`),
      index: Buffer.from(`b\n${middle}b\n`),
      worktree: Buffer.from(`c\n${middle}c\n`),
    },
  };
}

test.each(sides)(
  "%s diff: has the hunks git prints with three lines of context",
  async (side) => {
    await fc.assert(
      fc.asyncProperty(file, diffAlgorithm, async ({ path, versions }, algorithm) => {
        await inRepository(async (repository) => {
          setUp(repository, [{ path, versions }], algorithm);

          const { hunks } = await readDiff({ directory: repository, path, side });

          expect(hunks).toStrictEqual(hunksOf(gitsDiff(repository, path, side, versions)));
        });
      }),
      {
        numRuns: 30,
        examples: [
          [apart(6), "myers"],
          [apart(7), "myers"],
          // An untracked file named `-`, which `git diff --no-index` would read from its input.
          [
            {
              path: "-",
              versions: { head: Buffer.from("a"), index: undefined, worktree: Buffer.from("a") },
            },
            "myers",
          ],
        ],
      },
    );
  },
  timeout,
);

test.each([
  ["diff.context", "0"],
  ["diff.interHunkContext", "10"],
])("has the hunks git prints by default, though the user's %s is %s", async (key, value) => {
  await inRepository(async (repository) => {
    const { path, versions } = apart(7);

    setUp(repository, [{ path, versions }], "myers");

    const hunks = hunksOf(gitsDiff(repository, path, "staged", versions));

    runGit(repository, ["config", key, value]);

    await expect(readDiff({ directory: repository, path, side: "staged" })).resolves.toMatchObject({
      hunks,
    });
    expect(hunks).toHaveLength(2);
  });
});

test.each(sides)(
  "%s diff: has every line of the version a text diff goes to, once it's asked for them",
  async (side) => {
    await fc.assert(
      fc.asyncProperty(file, async ({ path, versions }) => {
        await inRepository(async (repository) => {
          setUp(repository, [{ path, versions }], "myers");

          const { kind, contents } = await readDiff({
            directory: repository,
            path,
            side,
            entire: true,
          });

          expect(contents).toStrictEqual(expectedContents(kind, side, versions));
        });
      }),
      { numRuns: 30 },
    );
  },
  timeout,
);

test("a renamed file's contents are its own", async () => {
  await inRepository(async (repository) => {
    commitTenLines(repository);
    runGit(repository, ["mv", "--", "a", "b"]);
    writeFile(repository, "b", tenLines.replace("5", "five"));
    runGit(repository, ["add", "--all"]);

    const { renamedFrom, hunks, contents } = await readDiff({
      directory: repository,
      path: "b",
      side: "staged",
      entire: true,
    });

    expect(renamedFrom).toBe("a");
    expect(hunks.map(({ oldStart, newStart }) => [oldStart, newStart])).toStrictEqual([[2, 2]]);
    expect(contents.map(({ text }) => text)).toStrictEqual(
      tenLines.replace("5", "five").split("\n").slice(0, -1),
    );
  });
});

test("a binary file has no contents", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\0");

    const { kind, contents } = await readDiff({
      directory: repository,
      path: "a",
      side: "unstaged",
      entire: true,
    });

    expect(kind).toBe("binary");
    expect(contents).toStrictEqual([]);
  });
});
