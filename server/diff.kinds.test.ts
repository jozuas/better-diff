import { expect, test } from "vitest";

import { diffRpc } from "../shared/diff";
import { deleteFile, inRepository, runGit, writeFile, writeSymlink } from "../test/repository";
import { setUp } from "../test/staging";
import type { Side } from "../test/staging";
import { readDiff } from "./diff";

function bytes(text: string | undefined): Buffer | undefined {
  return text === undefined ? undefined : Buffer.from(text);
}

test.each([
  ["unchanged", "a file that didn't change", "a\n", "a\n"],
  ["text", "a file whose lines changed", "a\n", "b\n"],
  ["text", "a new empty file", undefined, ""],
  ["binary", "a binary file", "a\0", "b\0"],
  [
    "text",
    "a file whose lines look like a symlink's",
    "a\n",
    "new file mode 120000\nindex 1..2 120000\n",
  ],
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

function commitAll(repository: string): void {
  runGit(repository, ["add", "--all"]);
  runGit(repository, ["commit", "--quiet", "--message", "Commit"]);
}

function commit(repository: string, content: string): void {
  writeFile(repository, "a", content);
  commitAll(repository);
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

// Each leaves a symlink in at least one of the versions the unstaged diff goes between.
const symlinks: [string, (repository: string) => void][] = [
  [
    "an untracked one",
    (repository) => {
      writeSymlink(repository, "a", "b");
    },
  ],
  [
    "one whose target changed",
    (repository) => {
      writeSymlink(repository, "a", "b");
      commitAll(repository);
      deleteFile(repository, "a");
      writeSymlink(repository, "a", "c");
    },
  ],
  [
    "a deleted one",
    (repository) => {
      writeSymlink(repository, "a", "b");
      commitAll(repository);
      deleteFile(repository, "a");
    },
  ],
  [
    "a file that became one",
    (repository) => {
      commit(repository, "a\n");
      deleteFile(repository, "a");
      writeSymlink(repository, "a", "b");
    },
  ],
  [
    "one that became a file",
    (repository) => {
      writeSymlink(repository, "a", "b");
      commitAll(repository);
      deleteFile(repository, "a");
      writeFile(repository, "a", "a\n");
    },
  ],
];

test.each(symlinks)("reads as a symlink's, without lines, the diff of %s", async (_, setUpFile) => {
  await inRepository(async (repository) => {
    setUpFile(repository);

    const diff = await readDiff({ directory: repository, path: "a", side: "unstaged" });

    expect(diff).toMatchObject({ kind: "symlink", hunks: [] });
    expect(diffRpc.output.parse(diff)).toStrictEqual(diff);
  });
});

test("reads an untracked file's unstaged diff as all of its lines added, beside another one", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\nb");
    writeFile(repository, "b", "c\n");

    const diff = await readDiff({ directory: repository, path: "a", side: "unstaged" });

    expect(diff).toMatchObject({
      kind: "text",
      hunks: [
        {
          oldStart: 0,
          newStart: 1,
          lines: [
            { kind: "added", text: "a", newline: true },
            { kind: "added", text: "b", newline: false },
          ],
        },
      ],
    });
  });
});

test("reads as unchanged an untracked file's staged diff", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");

    const diff = await readDiff({ directory: repository, path: "a", side: "staged" });

    expect(diff.kind).toBe("unchanged");
  });
});

// Ten lines, so changing one leaves the file similar enough to its original for a rename.
const tenLines = "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n";

// Each stages a rename of `a` to `b`.
const renames: [string, (repository: string) => void][] = [
  [
    "a rename",
    (repository) => {
      runGit(repository, ["mv", "a", "b"]);
    },
  ],
  [
    "a rename with an edit",
    (repository) => {
      runGit(repository, ["mv", "a", "b"]);
      writeFile(repository, "b", tenLines.replace("5", "five"));
      runGit(repository, ["add", "--all"]);
    },
  ],
  [
    "a rename, though the user's config turns renames off for diffs",
    (repository) => {
      runGit(repository, ["config", "status.renames", "true"]);
      runGit(repository, ["config", "diff.renames", "false"]);
      runGit(repository, ["mv", "a", "b"]);
    },
  ],
];

test.each(renames)("reads as renamed, without lines, the staged diff of %s", async (_, rename) => {
  await inRepository(async (repository) => {
    commit(repository, tenLines);
    rename(repository);

    const diff = await readDiff({ directory: repository, path: "b", side: "staged" });

    expect(diff).toMatchObject({ kind: "renamed", hunks: [] });
    expect(diffRpc.output.parse(diff)).toStrictEqual(diff);
  });
});

test("reads a file's staged diff as its own, beside a staged rename", async () => {
  await inRepository(async (repository) => {
    commit(repository, tenLines);
    writeFile(repository, "c", "a\n");
    commitAll(repository);
    runGit(repository, ["mv", "a", "b"]);
    writeFile(repository, "c", "b\n");
    runGit(repository, ["add", "--all"]);

    const diff = await readDiff({ directory: repository, path: "c", side: "staged" });

    expect(diff.hunks).toStrictEqual([
      {
        oldStart: 1,
        newStart: 1,
        lines: [
          { kind: "removed", text: "a", newline: true },
          { kind: "added", text: "b", newline: true },
        ],
      },
    ]);
  });
});

// git status takes a file added beside one changed in the same commit for a copy, when its config
// says to look for copies, but the original is still there.
test("reads a copy's staged diff as a new file's", async () => {
  await inRepository(async (repository) => {
    runGit(repository, ["config", "status.renames", "copies"]);
    commit(repository, tenLines);
    writeFile(repository, "b", tenLines);
    writeFile(repository, "a", tenLines.replace("5", "five"));
    runGit(repository, ["add", "--all"]);

    const diff = await readDiff({ directory: repository, path: "b", side: "staged" });

    expect(diff.kind).toBe("text");
    expect(
      diff.hunks.map(({ oldStart, lines }) => ({ oldStart, lines: lines.length })),
    ).toStrictEqual([{ oldStart: 0, lines: 10 }]);
  });
});
