import * as fc from "fast-check";
import { expect, test } from "vitest";

import { eachOnItsOwn, listingsOf } from "../test/batches";
import type { Group } from "../test/batches";
import { changedFiles, changeFiles } from "../test/changed-files";
import {
  commitAll,
  deleteFile,
  inRepository,
  runGit,
  timeout,
  writeFile,
} from "../test/repository";
import { batchedChanges } from "./batches";
import type { Side } from "./diff";

const groups: [Group, Side][] = [
  ["modified", "unstaged"],
  ["untracked", "unstaged"],
  ["staged", "staged"],
];

test.each(groups)(
  "reads each %s file a diff of several reads as its own diff does, however the files changed",
  async (group, side) => {
    await fc.assert(
      fc.asyncProperty(changedFiles, fc.boolean(), async (files, renames) => {
        await inRepository(async (repository) => {
          runGit(repository, ["config", "status.renames", String(renames)]);
          changeFiles(repository, files);

          const listings = await listingsOf(repository, group);
          const batched = await batchedChanges(repository, listings, side);

          expect(batched).toStrictEqual(
            await eachOnItsOwn(repository, listings, side, [...batched.keys()]),
          );
        });
      }),
      { numRuns: 30 },
    );
  },
  timeout,
);

// A path with each ASCII character but `/`, which git quotes a path for and escapes, by a letter or
// in octal, or prints as it is, and with characters that aren't ASCII. Capital letters are left out,
// as macOS takes a path that differs only in case for the same file.
const characterPaths = [
  ...Array.from({ length: 0x7f }, (_, index) => String.fromCodePoint(index + 1)),
  "é",
  "中",
].flatMap((character) =>
  character === "/" || character !== character.toLowerCase() ? [] : [`a${character}`],
);

test("reads with a diff of several each file, whatever characters its path has", async () => {
  await inRepository(async (repository) => {
    for (const path of characterPaths) {
      writeFile(repository, path, "a\n");
    }

    commitAll(repository);

    for (const path of characterPaths) {
      writeFile(repository, path, "b\n");
    }

    const listings = await listingsOf(repository, "modified");
    const batched = await batchedChanges(repository, listings, "unstaged");

    expect([...batched.keys()].toSorted()).toStrictEqual(characterPaths.toSorted());
    expect(batched).toStrictEqual(
      await eachOnItsOwn(repository, listings, "unstaged", characterPaths),
    );
  });
});

// Lines in a file that start as a file's diff does in a diff of several, and one in which a file's
// diff starts after a carriage return.
const diffStarts = "diff --git a/a b/a\ndiff --cc a\n* Unmerged path a\nb\rdiff --git a/a b/a\n";

test("reads with a diff of several a file whose lines start as a file's diff does", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    writeFile(repository, "b", diffStarts);
    commitAll(repository);
    writeFile(repository, "a", diffStarts);
    writeFile(repository, "b", "b\n");

    const listings = await listingsOf(repository, "modified");

    await expect(batchedChanges(repository, listings, "unstaged")).resolves.toStrictEqual(
      await eachOnItsOwn(repository, listings, "unstaged", ["a", "b"]),
    );
  });
});

// More files than one diff reads, a few at a time.
const paths = Array.from({ length: 120 }, (_, index) => `f${index}`);

// Each changes the files committed at `paths` in a way that puts them in the group.
const changesInGroups: [string, Group, Side, (repository: string) => void][] = [
  [
    "modified files",
    "modified",
    "unstaged",
    (repository) => {
      for (const path of paths) {
        writeFile(repository, path, "b\n");
      }
    },
  ],
  [
    "staged files",
    "staged",
    "staged",
    (repository) => {
      for (const path of paths) {
        writeFile(repository, path, "b\n");
      }

      runGit(repository, ["add", "--all"]);
    },
  ],
  [
    "staged renames",
    "staged",
    "staged",
    (repository) => {
      for (const path of paths) {
        runGit(repository, ["mv", path, `${path}~`]);
      }
    },
  ],
  [
    "files moved in the worktree",
    "modified",
    "unstaged",
    (repository) => {
      for (const path of paths) {
        deleteFile(repository, path);
        writeFile(repository, `${path}~`, `${path}\n`);
      }
    },
  ],
  [
    "files moved in the worktree and added intent-to-add",
    "modified",
    "unstaged",
    (repository) => {
      for (const path of paths) {
        deleteFile(repository, path);
        writeFile(repository, `${path}~`, `${path}\n`);
      }

      runGit(repository, ["add", "--intent-to-add", "--all"]);
    },
  ],
];

test.each(changesInGroups)(
  "reads with diffs of several each of more %s than one diff reads",
  async (_, group, side, change) => {
    await inRepository(async (repository) => {
      for (const path of paths) {
        writeFile(repository, path, `${path}\n`);
      }

      commitAll(repository);
      change(repository);

      const listings = await listingsOf(repository, group);
      const batched = await batchedChanges(repository, listings, side);

      expect([...batched.keys()].toSorted()).toStrictEqual([...listings.keys()].toSorted());
      expect(listings.size).toBe(paths.length);
      expect(batched).toStrictEqual(
        await eachOnItsOwn(repository, listings, side, [...listings.keys()]),
      );
    });
  },
  timeout,
);
