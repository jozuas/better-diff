import { expect, test } from "vitest";

import {
  commitAll,
  deleteFile,
  inRepository,
  makeExecutable,
  runGit,
  writeFile,
} from "../test/repository";
import { diffCommands, fileState, linesOf, operations, setUp, sides } from "../test/staging";
import type { FileState, Operation, Side } from "../test/staging";
import { applyLines, readDiff } from "./diff";

async function applyAll(repository: string, operation: Operation): Promise<void> {
  const diff = await readDiff({ directory: repository, path: "a", side: sides[operation] });

  await applyLines({
    directory: repository,
    path: "a",
    operation,
    version: diff.version,
    lines: linesOf(diff, () => true),
  });
}

function diffOf(repository: string, side: Side): string {
  return runGit(repository, [...diffCommands[side], "--", "a"]);
}

test("reads a staged file replaced by a staged directory as deleted, without the directory's file", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    commitAll(repository);
    deleteFile(repository, "a");
    writeFile(repository, "a/x", "x\n");
    runGit(repository, ["add", "--all"]);

    const replaced = await readDiff({ directory: repository, path: "a", side: "staged" });

    runGit(repository, ["rm", "--cached", "--quiet", "--", "a/x"]);

    expect(replaced).toStrictEqual(
      await readDiff({ directory: repository, path: "a", side: "staged" }),
    );
  });
});

// Each side's diff of a file whose mode changes from HEAD to the index and back in the worktree,
// once its lines are the same.
const modeChanges: Record<Side, string> = {
  staged: "diff --git a/a b/a\nold mode 100644\nnew mode 100755\n",
  unstaged: "diff --git a/a b/a\nold mode 100755\nnew mode 100644\n",
};

test.each(operations)(
  "%s every line of a file whose mode changed, and leaves the mode change",
  async (operation) => {
    await inRepository(async (repository) => {
      setUp(
        repository,
        [
          {
            path: "a",
            versions: {
              head: Buffer.from("a\n"),
              index: Buffer.from("b\n"),
              worktree: Buffer.from("c\n"),
            },
          },
        ],
        "myers",
      );
      runGit(repository, ["update-index", "--chmod=+x", "--", "a"]);

      await applyAll(repository, operation);

      expect(diffOf(repository, sides[operation])).toBe(modeChanges[sides[operation]]);
    });
  },
);

// Deletes the file from the version each operation brings it back to.
const deletions: [Operation, (repository: string) => void][] = [
  [
    "unstage",
    (repository) => {
      runGit(repository, ["rm", "--cached", "--quiet", "--", "a"]);
    },
  ],
  [
    "discard",
    (repository) => {
      deleteFile(repository, "a");
    },
  ],
];

test.each(deletions)(
  "%s every line of a deleted executable file brings it back executable",
  async (operation, deleteIt) => {
    await inRepository(async (repository) => {
      writeFile(repository, "a", "a\n");
      makeExecutable(repository, "a");
      commitAll(repository);
      deleteIt(repository);

      await applyAll(repository, operation);

      expect(diffOf(repository, sides[operation])).toBe("");
    });
  },
);

// What staging or discarding the second line of an untracked file named `-`, `a` then `b`, leaves.
const dashResults: [Operation, FileState][] = [
  ["stage", { index: Buffer.from("b\n"), worktree: Buffer.from("a\nb\n") }],
  ["discard", { index: undefined, worktree: Buffer.from("a\n") }],
];

test.each(dashResults)(
  "reads the lines of an untracked file named -, which git diff --no-index would read from its input, and can %s one",
  async (operation, result) => {
    await inRepository(async (repository) => {
      writeFile(repository, "-", "a\nb\n");

      const diff = await readDiff({ directory: repository, path: "-", side: "unstaged" });

      expect(diff.hunks.flatMap(({ lines }) => lines.map(({ text }) => text))).toStrictEqual([
        "a",
        "b",
      ]);

      await applyLines({
        directory: repository,
        path: "-",
        operation,
        version: diff.version,
        lines: [{ hunk: 0, line: 1 }],
      });

      expect(fileState(repository, "-")).toStrictEqual(result);
    });
  },
);
