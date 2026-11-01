import { readdirSync, readFileSync, utimesSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { commitTenLines, move, tenLines } from "../test/renames";
import {
  commitAll,
  deleteFile,
  inRepository,
  runGit,
  worktreeFile,
  writeFile,
} from "../test/repository";
import { listChanges } from "./changes";

test("pairs a moved file through a copy of the index, which it leaves as it was", async () => {
  await inRepository(async (repository) => {
    commitTenLines(repository);
    move(repository);

    const git = join(repository, ".git");
    const before = { files: readdirSync(git), index: readFileSync(join(git, "index")) };

    await expect(listChanges({ directory: repository })).resolves.toStrictEqual({
      modified: ["b"],
      untracked: [],
      staged: [],
    });
    expect({ files: readdirSync(git), index: readFileSync(join(git, "index")) }).toStrictEqual(
      before,
    );
  });
});

// git takes a file whose size and modification time are the same as when it was staged for
// unchanged, unless the index was written no earlier than the file was modified: then a change in
// the same second could have kept them, so git reads the file. Here the index has `a` as it was,
// though it changed.
test("finds a file changed as the index was written, while pairing a moved file", async () => {
  await inRepository(async (repository) => {
    const written = new Date("2000-01-01T00:00:00Z");

    runGit(repository, ["config", "core.trustctime", "false"]);
    writeFile(repository, "a", "a\n");
    writeFile(repository, "c", "c\n");
    utimesSync(join(repository, "a"), written, written);
    commitAll(repository);
    writeFile(repository, "a", "b\n");
    utimesSync(join(repository, "a"), written, written);
    utimesSync(join(repository, ".git", "index"), written, written);
    deleteFile(repository, "c");
    writeFile(repository, "d", "c\n");

    await expect(listChanges({ directory: repository })).resolves.toStrictEqual({
      modified: ["a", "d"],
      untracked: [],
      staged: [],
    });
  });
});

// A linked worktree's index isn't in the worktree's own directory, as the main one's is.
test("pairs a moved file in a linked worktree", async () => {
  await inRepository(async (repository) => {
    commitTenLines(repository);
    runGit(repository, ["worktree", "add", "--quiet", "linked"]);

    const linked = join(repository, "linked");

    move(linked);

    await expect(listChanges({ directory: linked })).resolves.toStrictEqual({
      modified: ["b"],
      untracked: [],
      staged: [],
    });
  });
});

// Adding `a/b` to the index takes `a` out of it, as a file can't be where a directory is.
test("lists a deleted file as deleted, not staged, where an untracked file takes its path as a directory", async () => {
  await inRepository(async (repository) => {
    commitTenLines(repository);
    deleteFile(repository, "a");
    writeFile(repository, "a/b", "b\n");

    await expect(listChanges({ directory: repository })).resolves.toStrictEqual({
      modified: ["a"],
      untracked: ["a/b"],
      staged: [],
    });
  });
});

// Adding a nested repository to the index makes it a submodule.
test("lists a nested repository as untracked, beside a deleted file", async () => {
  await inRepository(async (repository) => {
    commitTenLines(repository);
    deleteFile(repository, "a");

    const nested = join(repository, "nested");

    runGit(repository, ["init", "--quiet", "nested"]);
    writeFile(nested, "b", "b\n");
    commitAll(nested);

    await expect(listChanges({ directory: repository })).resolves.toStrictEqual({
      modified: ["a"],
      untracked: ["nested/"],
      staged: [],
    });
  });
});

test("lists a file deleted from the index but not the worktree as untracked, though it's a moved file", async () => {
  await inRepository(async (repository) => {
    commitTenLines(repository);
    writeFile(repository, "b", "b\n");
    commitAll(repository);
    runGit(repository, ["rm", "--cached", "--quiet", "--", "b"]);
    move(repository);

    await expect(listChanges({ directory: repository })).resolves.toStrictEqual({
      modified: ["a"],
      untracked: ["b"],
      staged: ["b"],
    });
  });
});

// git pairs `b`, added intent-to-add, with `a`, the file it changes least. With `0` intent-to-add
// too, a copy of `a`, it pairs `0` with `a` instead, and `b` with `c`.
test("keeps the renames git status finds for files added intent-to-add, which an untracked file can't take", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n");
    writeFile(repository, "c", "1\n2\n3\n4\n5\n6\n7\nY\nW\n10\n");
    commitAll(repository);
    writeFile(repository, "a", "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n");
    runGit(repository, ["add", "--all"]);
    writeFile(repository, "0", "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n");
    writeFile(repository, "b", "1\n2\n3\n4\n5\n6\n7\n8\n9\nZ\n");
    runGit(repository, ["add", "--intent-to-add", "--", "b"]);
    deleteFile(repository, "a");
    deleteFile(repository, "c");

    await expect(listChanges({ directory: repository })).resolves.toStrictEqual({
      modified: ["b", "c"],
      untracked: ["0"],
      staged: ["a"],
    });
  });
});

// core.protectNTFS, on by default, keeps git from having `git~1/b` in the index, as Windows takes it
// for the short name of `.git`.
test("lists a moved file as deleted and untracked where git won't add an untracked file", async () => {
  await inRepository(async (repository) => {
    commitTenLines(repository);
    move(repository);
    writeFile(repository, "git~1/b", "b\n");

    await expect(listChanges({ directory: repository })).resolves.toStrictEqual({
      modified: ["a"],
      untracked: ["b", "git~1/b"],
      staged: [],
    });
  });
});

test("pairs a file moved out of a sparse checkout", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "in/a", tenLines);
    writeFile(repository, "out/b", "b\n");
    commitAll(repository);
    runGit(repository, ["sparse-checkout", "set", "--cone", "in"]);
    deleteFile(repository, "in/a");
    writeFile(repository, "out/a", tenLines);

    await expect(listChanges({ directory: repository })).resolves.toStrictEqual({
      modified: ["out/a"],
      untracked: [],
      staged: [],
    });
  });
});

// Pairing files hashes each untracked one, which first runs it through its clean filter: this one
// notes the path of each file it cleans.
test("pairs the same files without cleaning them again, while they don't change", async () => {
  await inRepository(async (repository) => {
    commitTenLines(repository);
    writeFile(repository, ".git/info/attributes", "* filter=note\n");
    runGit(repository, [
      "config",
      "filter.note.clean",
      "sh -c 'echo \"$0\" >> .git/cleaned; cat' %f",
    ]);
    move(repository);

    const first = await listChanges({ directory: repository });
    const second = await listChanges({ directory: repository });

    expect({
      first,
      second,
      cleaned: worktreeFile(repository, ".git/cleaned")?.toString(),
    }).toStrictEqual({
      first: { modified: ["b"], untracked: [], staged: [] },
      second: { modified: ["b"], untracked: [], staged: [] },
      cleaned: "b\n",
    });
  });
});

test("pairs files again once a new one changes", async () => {
  await inRepository(async (repository) => {
    commitTenLines(repository);
    move(repository);
    await listChanges({ directory: repository });
    writeFile(repository, "b", "b\n");

    await expect(listChanges({ directory: repository })).resolves.toStrictEqual({
      modified: ["a"],
      untracked: ["b"],
      staged: [],
    });
  });
});
