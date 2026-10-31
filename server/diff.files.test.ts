import { expect, test } from "vitest";

import { diffRpc } from "../shared/diff";
import {
  deleteFile,
  inRepository,
  makeExecutable,
  runGit,
  writeFile,
  writeSymlink,
} from "../test/repository";
import { diffCommands, linesOf, operations, setUp, sides } from "../test/staging";
import type { Operation, Side } from "../test/staging";
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

test("refuses a path whose diff has more than one part, as a file that became a symlink has", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    runGit(repository, ["add", "--all"]);
    deleteFile(repository, "a");
    writeSymlink(repository, "a", "b");

    await expect(readDiff({ directory: repository, path: "a", side: "unstaged" })).rejects.toThrow(
      "git printed more than one diff for the path.",
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
      runGit(repository, ["add", "--all"]);
      runGit(repository, ["commit", "--quiet", "--message", "Commit"]);
      deleteIt(repository);

      await applyAll(repository, operation);

      expect(diffOf(repository, sides[operation])).toBe("");
    });
  },
);

function bytes(text: string | undefined): Buffer | undefined {
  return text === undefined ? undefined : Buffer.from(text);
}

test.each([
  ["unchanged", "a file that didn't change", "a\n", "a\n"],
  ["text", "a file whose lines changed", "a\n", "b\n"],
  ["text", "a new empty file", undefined, ""],
  ["binary", "a binary file", "a\0", "b\0"],
] as const)("reads as %s the diff of %s", async (kind, _, head, index) => {
  await inRepository(async (repository) => {
    setUp(
      repository,
      [{ path: "a", versions: { head: bytes(head), index: bytes(index), worktree: bytes(index) } }],
      "myers",
    );

    const diff = await readDiff({ directory: repository, path: "a", side: "staged" });

    expect(diff.kind).toBe(kind);
    expect(diffRpc.output.parse(diff)).toStrictEqual(diff);
  });
});

test.each([
  ["mode", "on its own", "a\n"],
  ["text", "with changed lines", "b\n"],
])("reads as %s the diff of a mode change %s", async (kind, _, index) => {
  await inRepository(async (repository) => {
    setUp(
      repository,
      [
        {
          path: "a",
          versions: { head: bytes("a\n"), index: bytes(index), worktree: bytes(index) },
        },
      ],
      "myers",
    );
    runGit(repository, ["update-index", "--chmod=+x", "--", "a"]);

    const diff = await readDiff({ directory: repository, path: "a", side: "staged" });

    expect(diff.kind).toBe(kind);
    expect(diffRpc.output.parse(diff)).toStrictEqual(diff);
  });
});

function commit(repository: string, content: string): void {
  writeFile(repository, "a", content);
  runGit(repository, ["add", "--all"]);
  runGit(repository, ["commit", "--quiet", "--message", "Commit"]);
}

// git compares the unstaged side of a file with conflicts with each side of the merge, and only
// names the file on the staged side.
test.each<Side>(["unstaged", "staged"])(
  "reads as unmerged the %s diff of a file with merge conflicts",
  async (side) => {
    await inRepository(async (repository) => {
      commit(repository, "a\n");
      runGit(repository, ["checkout", "--quiet", "-b", "other"]);
      commit(repository, "b\n");
      runGit(repository, ["checkout", "--quiet", "-"]);
      commit(repository, "c\n");

      expect(() => runGit(repository, ["merge", "--quiet", "other"])).toThrow("Command failed");

      const diff = await readDiff({ directory: repository, path: "a", side });

      expect(diff.kind).toBe("unmerged");
      expect(diffRpc.output.parse(diff)).toStrictEqual(diff);
    });
  },
);
