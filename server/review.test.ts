import type { RpcInput } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { groupRpc } from "../shared/diff";
import { files } from "../test/groups";
import {
  commitAll,
  deleteFile,
  inRepository,
  makeUnreadable,
  runGit,
  timeout,
  writeFile,
  writeSymlink,
} from "../test/repository";
import { diffAlgorithm, file, setUp } from "../test/staging";
import type { Diff, Side } from "../test/staging";
import { readStatus } from "./changes";
import { readDiff } from "./diff";
import { changesIn } from "./file-changes";
import { readGroup } from "./groups";
import { indexChanged, otherChanges, reviewIn } from "./review";
import { untilUnchanged } from "./tries";

type Group = RpcInput<typeof groupRpc>["group"];

const sides: readonly Side[] = ["unstaged", "staged"];

const others: Record<Side, Side> = { unstaged: "staged", staged: "unstaged" };

// The diff's hunks, by the kind of each line.
function kindsOf(hunks: Diff["hunks"]) {
  return hunks.map(({ oldStart, newStart, lines }) => ({
    oldStart,
    newStart,
    lines: lines.map(({ kind }) => ({ kind })),
  }));
}

// The file's review, if it was read with one.
function reviewOfFile(read: Awaited<ReturnType<typeof readGroup>>["files"][number]) {
  return "review" in read ? read.review : undefined;
}

test.each(sides)(
  "the %s diff's review has the hunks of the file's other diff, as that diff reads them, however git abbreviates the blobs it names",
  async (side) => {
    await fc.assert(
      fc.asyncProperty(
        file,
        diffAlgorithm,
        fc.boolean(),
        fc.boolean(),
        fc.constantFrom("4", "7", "12", "no"),
        async (changed, algorithm, hideWhitespace, entire, abbrev) => {
          await inRepository(async (repository) => {
            setUp(repository, [changed], algorithm);
            runGit(repository, ["config", "core.abbrev", abbrev]);

            const asked = { directory: repository, path: changed.path, hideWhitespace };
            const own = await readDiff({ ...asked, side, entire });
            const other = await readDiff({ ...asked, side: others[side], expand: true });

            expect(own.review).toStrictEqual({ other: kindsOf(other.hunks) });
          });
        },
      ),
    );
  },
  timeout,
);

test(
  "each file of a group read has the review its own diff has",
  async () => {
    await fc.assert(
      fc.asyncProperty(
        files,
        diffAlgorithm,
        fc.constantFrom<[Group, Side]>(
          ["modified", "unstaged"],
          ["untracked", "unstaged"],
          ["staged", "staged"],
        ),
        async (written, algorithm, [group, side]) => {
          await inRepository(async (repository) => {
            setUp(repository, written, algorithm);

            const read = await readGroup({ directory: repository, group });

            const own = await Promise.all(
              read.files.map(async ({ path }) => {
                const diff = await readDiff({ directory: repository, path, side });

                return diff.review;
              }),
            );

            expect(read.files.map(reviewOfFile)).toStrictEqual(own);
          });
        },
      ),
    );
  },
  timeout,
);

// Reads how many times it's been read, and that the index changed as it was until it's been read
// more than `changes` times.
function changedFor(changes: number): () => Promise<{ reads: number; changed: boolean }> {
  let reads = 0;

  return async () => {
    reads += 1;
    await Promise.resolve();

    return { reads, changed: reads <= changes };
  };
}

test.each([
  [0, { reads: 1, changed: false }],
  [1, { reads: 2, changed: false }],
  [2, { reads: 3, changed: false }],
  [3, { reads: 3, changed: true }],
  [4, { reads: 3, changed: true }],
])(
  "what's read as the index changes %i times is read again, three times at most",
  async (changes, read) => {
    await expect(untilUnchanged(changedFor(changes))).resolves.toStrictEqual(read);
  },
);

// A repository with the file `a` partly staged, and `b` staged.
function partlyStaged(repository: string): void {
  writeFile(repository, "a", "a\n");
  writeFile(repository, "b", "b\n");
  commitAll(repository);
  writeFile(repository, "a", "b\n");
  writeFile(repository, "b", "c\n");
  runGit(repository, ["add", "a", "b"]);
  writeFile(repository, "a", "c\n");
}

// The entries git status lists the file at the path in now, and its changes on the side, as they
// say.
async function readNow(repository: string, path: string, side: Side) {
  const entries = await readStatus(repository);
  const listed = entries.filter((entry) => entry.path === path);
  const changes = await changesIn(repository, listed, path, side);

  return { listed, changes };
}

test.each(sides)(
  "a file's %s diff, read of other lines of the index than its other diff, as while another program stages and unstages, has no review, and is to be read again, though the index's other entries changing leaves it one",
  async (side) => {
    await inRepository(async (repository) => {
      partlyStaged(repository);

      const { changes: other } = await readNow(repository, "a", others[side]);

      writeFile(repository, "b", "d\n");
      runGit(repository, ["add", "b"]);

      const kept = await readNow(repository, "a", side);

      expect(reviewIn(side, kept.listed, kept.changes, other)).toBeDefined();
      expect(indexChanged(side, kept.listed, kept.changes, other)).toBe(false);

      writeFile(repository, "a", "B\n");
      runGit(repository, ["add", "a"]);
      writeFile(repository, "a", "c\n");

      const restaged = await readNow(repository, "a", side);

      expect(reviewIn(side, restaged.listed, restaged.changes, other)).toBeUndefined();
      expect(indexChanged(side, restaged.listed, restaged.changes, other)).toBe(true);
    });
  },
);

// A repository with the file `u` changed only in the worktree, and `s` only in the index.
function changedOnOneSide(repository: string): void {
  writeFile(repository, "u", "1\n");
  writeFile(repository, "s", "1\n");
  commitAll(repository);
  writeFile(repository, "u", "2\n");
  writeFile(repository, "s", "2\n");
  runGit(repository, ["add", "s"]);
}

test.each([
  ["unstaged", "u"],
  ["staged", "s"],
] as const)(
  "a file's %s diff, read of other lines of the index than git status listed the file with, as once another program stages it after git status, has no review, and is to be read again, though it has no changes on the other side, unless those can't be read",
  async (side, path) => {
    await inRepository(async (repository) => {
      changedOnOneSide(repository);

      const { listed, changes } = await readNow(repository, path, side);
      const other = await otherChanges(repository, listed, path, side);

      expect(reviewIn(side, listed, changes, other)).toStrictEqual({ other: [] });

      writeFile(repository, path, "3\n");
      runGit(repository, ["add", path]);
      writeFile(repository, path, "4\n");

      const restaged = await changesIn(repository, listed, path, side);

      expect(reviewIn(side, listed, restaged, other)).toBeUndefined();
      expect(indexChanged(side, listed, restaged, other)).toBe(true);
      expect(indexChanged(side, listed, restaged, null)).toBe(false);
    });
  },
);

test("a diff whose file's other diff names no blob of the index, as one only renaming it, has a review", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    commitAll(repository);
    runGit(repository, ["mv", "a", "b"]);
    writeFile(repository, "b", "b\n");

    const unstaged = await readNow(repository, "b", "unstaged");
    const staged = await readNow(repository, "b", "staged");

    expect(reviewIn("unstaged", unstaged.listed, unstaged.changes, staged.changes)).toStrictEqual({
      other: [],
    });
    expect(reviewIn("staged", staged.listed, staged.changes, unstaged.changes)).toMatchObject({
      other: [{ oldStart: 1 }],
    });
  });
});

test("a file whose type the index changes, as from a symlink to a file, and the worktree changes again, has a review of each of its diffs", async () => {
  await inRepository(async (repository) => {
    writeSymlink(repository, "a", "b");
    commitAll(repository);
    deleteFile(repository, "a");
    writeFile(repository, "a", "a\n");
    runGit(repository, ["add", "a"]);
    writeFile(repository, "a", "b\n");

    const unstaged = await readDiff({ directory: repository, path: "a", side: "unstaged" });
    const staged = await readDiff({ directory: repository, path: "a", side: "staged" });

    expect(unstaged.review).toStrictEqual({ other: kindsOf(staged.hunks) });
    expect(staged.review).toStrictEqual({ other: kindsOf(unstaged.hunks) });
    expect(unstaged.hunks).toHaveLength(1);
  });
});

test("a diff whose file's other diff can't be parsed has no review, and isn't to be read again", async () => {
  await inRepository(async (repository) => {
    partlyStaged(repository);

    const { listed, changes: own } = await readNow(repository, "a", "unstaged");
    const { changes: other } = await readNow(repository, "a", "staged");
    const unparsed = Buffer.concat([other.diff, Buffer.from("not a line of a hunk\n")]);

    expect(reviewIn("unstaged", listed, own, { ...other, diff: unparsed })).toBeUndefined();
    expect(indexChanged("unstaged", listed, own, { ...other, diff: unparsed })).toBe(false);
  });
});

test("a diff, or a group's, whose file's other diff can't be read is read without its review", async () => {
  await inRepository(async (repository) => {
    partlyStaged(repository);
    makeUnreadable(repository, "a");

    const read = await readDiff({ directory: repository, path: "a", side: "staged" });
    const group = await readGroup({ directory: repository, group: "staged" });

    expect(read).toMatchObject({ kind: "text", added: 1, removed: 1 });
    expect(read).not.toHaveProperty("review");
    expect(group.files).toMatchObject([
      { path: "a", kind: "text" },
      { path: "b", review: { other: [] } },
    ]);
    expect(group.files[0]).not.toHaveProperty("review");
  });
});
