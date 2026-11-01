import { expect, test } from "vitest";

import { diffRpc } from "../shared/diff";
import { deleteFile, inRepository, runGit, writeFile } from "../test/repository";
import type { Side } from "../test/staging";
import { readDiff } from "./diff";

function commitAll(repository: string): void {
  runGit(repository, ["add", "--all"]);
  runGit(repository, ["commit", "--quiet", "--message", "Commit"]);
}

// Ten lines, so changing one leaves the file similar enough to its original for a rename.
const tenLines = "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n";

function commitTenLines(repository: string): void {
  writeFile(repository, "a", tenLines);
  commitAll(repository);
}

function move(repository: string): void {
  deleteFile(repository, "a");
  writeFile(repository, "b", tenLines);
}

// Each renames `a` to `b` on the side, with no other change.
const unchangedRenames: [Side, string, (repository: string) => void][] = [
  [
    "staged",
    "a staged rename",
    (repository) => {
      runGit(repository, ["mv", "a", "b"]);
    },
  ],
  [
    "staged",
    "a staged rename, though the user's config turns renames off for diffs",
    (repository) => {
      runGit(repository, ["config", "status.renames", "true"]);
      runGit(repository, ["config", "diff.renames", "false"]);
      runGit(repository, ["mv", "a", "b"]);
    },
  ],
  ["unstaged", "a file moved in the worktree", move],
  [
    "unstaged",
    "a file moved in the worktree, though the user's config turns renames off for diffs",
    (repository) => {
      runGit(repository, ["config", "status.renames", "true"]);
      runGit(repository, ["config", "diff.renames", "false"]);
      move(repository);
    },
  ],
];

test.each(unchangedRenames)(
  "reads as renamed from its old path, without lines, the %s diff of %s",
  async (side, _, rename) => {
    await inRepository(async (repository) => {
      commitTenLines(repository);
      rename(repository);

      const diff = await readDiff({ directory: repository, path: "b", side });

      expect(diff).toMatchObject({ kind: "renamed", renamedFrom: "a", hunks: [] });
      expect(diffRpc.output.parse(diff)).toStrictEqual(diff);
    });
  },
);

test.each([
  [
    "mode",
    "a mode change",
    (repository: string) => {
      runGit(repository, ["update-index", "--chmod=+x", "--", "b"]);
    },
  ],
  [
    "binary",
    "a binary change",
    (repository: string) => {
      writeFile(repository, "b", `${tenLines}\0`);
      runGit(repository, ["add", "--all"]);
    },
  ],
  [
    "text",
    "changed lines",
    (repository: string) => {
      writeFile(repository, "b", tenLines.replace("5", "five"));
      runGit(repository, ["add", "--all"]);
    },
  ],
] as const)("reads as %s a staged rename with %s", async (kind, _, change) => {
  await inRepository(async (repository) => {
    commitTenLines(repository);
    runGit(repository, ["mv", "a", "b"]);
    change(repository);

    const diff = await readDiff({ directory: repository, path: "b", side: "staged" });

    expect(diff).toMatchObject({ kind, renamedFrom: "a" });
  });
});

test.each<[Side, string, (repository: string) => void]>([
  [
    "unstaged",
    "a file whose rename is staged",
    (repository) => {
      runGit(repository, ["mv", "a", "b"]);
      writeFile(repository, "b", tenLines.replace("5", "five"));
    },
  ],
  ["staged", "a file moved in the worktree", move],
])("reads as not renamed the %s diff of %s", async (side, _, rename) => {
  await inRepository(async (repository) => {
    commitTenLines(repository);
    rename(repository);

    const diff = await readDiff({ directory: repository, path: "b", side });

    expect(diff.renamedFrom).toBeUndefined();
  });
});

// Each renames `a` to `b` on the side, beside a change to `c`.
const renamesBesideChanges: [Side, (repository: string) => void][] = [
  [
    "staged",
    (repository) => {
      runGit(repository, ["mv", "a", "b"]);
      writeFile(repository, "c", "b\n");
      runGit(repository, ["add", "--all"]);
    },
  ],
  [
    "unstaged",
    (repository) => {
      move(repository);
      writeFile(repository, "c", "b\n");
    },
  ],
];

test.each(renamesBesideChanges)(
  "reads a renamed file's %s diff as its own, beside another change",
  async (side, rename) => {
    await inRepository(async (repository) => {
      writeFile(repository, "c", "a\n");
      commitTenLines(repository);
      rename(repository);

      const diff = await readDiff({ directory: repository, path: "b", side });

      expect(diff).toMatchObject({ kind: "renamed", renamedFrom: "a", hunks: [] });
    });
  },
);

test("reads a file's staged diff as its own, beside a staged rename", async () => {
  await inRepository(async (repository) => {
    commitTenLines(repository);
    writeFile(repository, "c", "a\n");
    commitAll(repository);
    runGit(repository, ["mv", "a", "b"]);
    writeFile(repository, "c", "b\n");
    runGit(repository, ["add", "--all"]);

    const diff = await readDiff({ directory: repository, path: "c", side: "staged" });

    expect(diff).toMatchObject({
      renamedFrom: undefined,
      hunks: [
        {
          oldStart: 1,
          newStart: 1,
          lines: [
            { kind: "removed", text: "a", newline: true },
            { kind: "added", text: "b", newline: true },
          ],
        },
      ],
    });
  });
});

// git status takes a file added beside one changed in the same commit for a copy, when its config
// says to look for copies, but the original is still there.
test("reads a copy's staged diff as a new file's", async () => {
  await inRepository(async (repository) => {
    runGit(repository, ["config", "status.renames", "copies"]);
    commitTenLines(repository);
    writeFile(repository, "b", tenLines);
    writeFile(repository, "a", tenLines.replace("5", "five"));
    runGit(repository, ["add", "--all"]);

    const diff = await readDiff({ directory: repository, path: "b", side: "staged" });

    expect(diff).toMatchObject({ kind: "text", renamedFrom: undefined });
    expect(
      diff.hunks.map(({ oldStart, lines }) => ({ oldStart, lines: lines.length })),
    ).toStrictEqual([{ oldStart: 0, lines: 10 }]);
  });
});
