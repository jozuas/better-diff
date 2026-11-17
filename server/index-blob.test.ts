import * as fc from "fast-check";
import { expect, test } from "vitest";

import {
  commitAll,
  deleteFile,
  inRepository,
  makeExecutable,
  runGit,
  timeout,
  writeFile,
  writeSymlink,
} from "../test/repository";
import { diffAlgorithm, file, setUp } from "../test/staging";
import type { File } from "../test/staging";
import { git } from "./git";
import { blobOf } from "./index-blob";

// Whether two versions of a file are the same, as where neither has it.
function same(version: Buffer | undefined, other: Buffer | undefined): boolean {
  return version === undefined || other === undefined ? version === other : version.equals(other);
}

// The blob of the index the file at the path has there, as git names it in full, or undefined where
// the index hasn't the file.
function indexBlob(repository: string, path: string): string | undefined {
  const [entry] = runGit(repository, ["ls-files", "--stage", "-z", "--", path]).split("\0");

  return entry === "" ? undefined : entry?.split(" ")[1];
}

// The file's staged diff and its unstaged one, as git prints them.
async function diffsOf(repository: string, path: string): Promise<[Buffer, Buffer]> {
  const diffs = await Promise.all([
    git(repository, "diff", ["--cached"], [path]),
    git(repository, "diff", [], [path]),
  ]);

  return diffs;
}

// The blob each diff names for the index, the staged one's that it goes to and the unstaged one's
// that it goes from, where it names one, and whether each is the index's, as git abbreviates it.
function namedForIndex([staged, unstaged]: [Buffer, Buffer], blob: string | undefined) {
  const named = [blobOf(staged, "new"), blobOf(unstaged, "old")];

  return {
    named: named.map((each) => each !== undefined),
    agreeing: named.every(
      (each) => each === undefined || blob === undefined || blob.startsWith(each),
    ),
  };
}

// Whether git names a blob for the index in each of the file's diffs: where its staged diff changes
// the file, and where its unstaged diff does, unless the index hasn't it, as of an untracked file.
function namedExpected({ versions: { head, index, worktree } }: File): boolean[] {
  return [!same(head, index), index !== undefined && !same(index, worktree)];
}

test(
  "the blob a staged diff goes to, and an unstaged one from, is the one the index has, as git abbreviates it, where the diff changes the file",
  async () => {
    await fc.assert(
      fc.asyncProperty(
        file,
        diffAlgorithm,
        fc.constantFrom("4", "7", "12", "no"),
        async (changed, algorithm, abbrev) => {
          await inRepository(async (repository) => {
            setUp(repository, [changed], algorithm);
            runGit(repository, ["config", "core.abbrev", abbrev]);

            const diffs = await diffsOf(repository, changed.path);

            expect(namedForIndex(diffs, indexBlob(repository, changed.path))).toStrictEqual({
              named: namedExpected(changed),
              agreeing: true,
            });
          });
        },
      ),
      { numRuns: 30 },
    );
  },
  timeout,
);

test("a diff that changes no line names no blob, nor does an empty one", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    writeFile(repository, "x", "a\n");
    commitAll(repository);
    runGit(repository, ["mv", "a", "b"]);
    makeExecutable(repository, "x");
    runGit(repository, ["add", "x"]);

    const renamed = await git(repository, "diff", ["--cached"], ["a", "b"]);
    const mode = await git(repository, "diff", ["--cached"], ["x"]);

    expect([blobOf(renamed, "old"), blobOf(renamed, "new")]).toStrictEqual([undefined, undefined]);
    expect([blobOf(mode, "old"), blobOf(mode, "new")]).toStrictEqual([undefined, undefined]);
    expect(blobOf(Buffer.alloc(0), "new")).toBeUndefined();
  });
});

test("a file whose type changed, whose diff deletes it and then adds it, has the blob it's deleted as on the old side, and the one it's added as on the new one", async () => {
  await inRepository(async (repository) => {
    writeSymlink(repository, "a", "b");
    commitAll(repository);
    deleteFile(repository, "a");
    writeFile(repository, "a", "a\n");
    runGit(repository, ["add", "a"]);
    runGit(repository, ["config", "core.abbrev", "7"]);

    const changed = await git(repository, "diff", ["--cached"], ["a"]);
    const head = runGit(repository, ["rev-parse", "HEAD:a"]);

    expect([blobOf(changed, "old"), blobOf(changed, "new")]).toStrictEqual([
      head.slice(0, 7),
      indexBlob(repository, "a")?.slice(0, 7),
    ]);
  });
});

test("a file whose path names blobs, as git writes them, has its own", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "index 1..2", "a\n");
    commitAll(repository);
    writeFile(repository, "index 1..2", "b\n");
    runGit(repository, ["config", "core.abbrev", "7"]);

    const changed = await git(repository, "diff", [], ["index 1..2"]);

    expect(blobOf(changed, "old")).toBe(indexBlob(repository, "index 1..2")?.slice(0, 7));
  });
});

test("a diff whose hunks have a line like a blob's has the blob its header names", () => {
  const diff = Buffer.from(
    "diff --git a/a b/a\nindex 1234567..89abcde 100644\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n-x\n+index 1..2\n",
  );

  const headerless = Buffer.from("diff --git a/a b/a\n@@ -1 +1 @@\n-x\nindex 1..2\n");

  expect([blobOf(diff, "old"), blobOf(diff, "new")]).toStrictEqual(["1234567", "89abcde"]);
  expect(blobOf(headerless, "old")).toBeUndefined();
});
