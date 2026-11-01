import { readdirSync, readFileSync, utimesSync } from "node:fs";
import { join } from "node:path";

import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import { changesRpc } from "../shared/changes";
import { canCoexist, filePath } from "../test/file-names";
import { deleteFile, inRepository, runGit, timeout, writeFile } from "../test/repository";
import { listChanges } from "./changes";

type Changes = RpcOutput<typeof changesRpc>;

// A file's version in HEAD, in the index and in the worktree, null where it's absent. A file the
// index has can instead be moved in the worktree, unchanged, as `mv` moves it.
interface Versions {
  path: string;
  head: 1 | null;
  index: 1 | 2 | null;
  worktree: 1 | 2 | 3 | null;
  movedTo: string | null;
}

function allPaths(files: readonly Versions[]): string[] {
  return files.flatMap(({ path, movedTo }) => (movedTo === null ? [path] : [path, movedTo]));
}

const versions = fc
  .uniqueArray(
    fc.record({
      path: filePath,
      head: fc.constantFrom(1, null),
      index: fc.constantFrom(1, 2, null),
      worktree: fc.constantFrom(1, 2, 3, null),
      movedTo: fc.oneof(
        { weight: 5, arbitrary: fc.constant(null) },
        { weight: 1, arbitrary: filePath },
      ),
    }),
    { selector: ({ path }) => path, maxLength: 24 },
  )
  .map((files) => files.map((file) => (file.index === null ? { ...file, movedTo: null } : file)))
  .filter((files) => canCoexist(allPaths(files)));

function writeVersions(
  repository: string,
  files: readonly Versions[],
  tree: "head" | "index" | "worktree",
): void {
  for (const [number, file] of files.entries()) {
    const version = file[tree];

    if (tree === "worktree" && file.movedTo !== null) {
      deleteFile(repository, file.path);
      writeFile(repository, file.movedTo, `${number} ${file.index}\n`);
    } else if (version === null) {
      deleteFile(repository, file.path);
    } else {
      // No two files have the same content, so git never takes a deleted file and an added one
      // for a rename.
      writeFile(repository, file.path, `${number} ${version}\n`);
    }
  }
}

function paths(files: readonly Versions[], predicate: (file: Versions) => boolean): string[] {
  return files.flatMap((file) => (predicate(file) ? [file.path] : []));
}

// What git status reports, worked out from each file's versions. A moved file is modified under its
// new name, as renamed, and its old name is only listed if the index changed it.
function expectedChanges(files: readonly Versions[]): Changes {
  const stayed = files.filter(({ movedTo }) => movedTo === null);

  return {
    modified: [
      ...paths(stayed, ({ index, worktree }) => index !== null && worktree !== index),
      ...files.flatMap(({ movedTo }) => (movedTo === null ? [] : [movedTo])),
    ],
    untracked: paths(stayed, ({ index, worktree }) => index === null && worktree !== null),
    staged: paths(files, ({ head, index }) => head !== index),
  };
}

function sorted({ modified, untracked, staged }: Changes): Changes {
  return {
    modified: modified.toSorted(),
    untracked: untracked.toSorted(),
    staged: staged.toSorted(),
  };
}

test(
  "lists what git status does: modified, untracked and staged files, and moved ones as renamed",
  async () => {
    await fc.assert(
      fc.asyncProperty(versions, async (files) => {
        await inRepository(async (repository) => {
          writeVersions(repository, files, "head");
          runGit(repository, ["add", "--all"]);
          runGit(repository, ["commit", "--quiet", "--allow-empty", "--message", "Commit"]);
          writeVersions(repository, files, "index");
          runGit(repository, ["add", "--all"]);
          writeVersions(repository, files, "worktree");

          const changes = await listChanges({ directory: repository });

          expect(sorted(changes)).toStrictEqual(sorted(expectedChanges(files)));
        });
      }),
      // A run takes about 70ms, most of it in git, so there are fewer runs, each with more files.
      { numRuns: 30 },
    );
  },
  timeout,
);

test("lists a staged rename under its new name, and never reads the old name as an entry", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "? a", "a\n");
    runGit(repository, ["add", "--all"]);
    runGit(repository, ["commit", "--quiet", "--message", "Commit"]);
    runGit(repository, ["mv", "? a", "b"]);

    await expect(listChanges({ directory: repository })).resolves.toStrictEqual({
      modified: [],
      untracked: [],
      staged: ["b"],
    });
  });
});

function commit(repository: string): void {
  writeFile(repository, "a", "a\n");
  runGit(repository, ["add", "--all"]);
  runGit(repository, ["commit", "--quiet", "--message", "Commit"]);
}

function move(worktree: string): void {
  deleteFile(worktree, "a");
  writeFile(worktree, "b", "a\n");
}

test("pairs a moved file through a copy of the index, which it leaves as it was", async () => {
  await inRepository(async (repository) => {
    commit(repository);
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
    runGit(repository, ["add", "--all"]);
    runGit(repository, ["commit", "--quiet", "--message", "Commit"]);
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
    commit(repository);
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
    commit(repository);
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
    commit(repository);
    deleteFile(repository, "a");

    const nested = join(repository, "nested");

    runGit(repository, ["init", "--quiet", "nested"]);
    writeFile(nested, "b", "b\n");
    runGit(nested, ["add", "--all"]);
    runGit(nested, ["commit", "--quiet", "--message", "Commit"]);

    await expect(listChanges({ directory: repository })).resolves.toStrictEqual({
      modified: ["a"],
      untracked: ["nested/"],
      staged: [],
    });
  });
});

test("lists a file deleted from the index but not the worktree as untracked, though it's a moved file", async () => {
  await inRepository(async (repository) => {
    commit(repository);
    writeFile(repository, "b", "b\n");
    runGit(repository, ["add", "--all"]);
    runGit(repository, ["commit", "--quiet", "--message", "Commit"]);
    runGit(repository, ["rm", "--cached", "--quiet", "--", "b"]);
    deleteFile(repository, "a");
    writeFile(repository, "b", "a\n");

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
    runGit(repository, ["add", "--all"]);
    runGit(repository, ["commit", "--quiet", "--message", "Commit"]);
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

test("answers the same through the RPC's input and output validation", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "");

    const changes = await listChanges({ directory: repository });

    const validated = changesRpc.output.parse(
      await listChanges(changesRpc.input.parse({ directory: repository })),
    );

    expect(validated).toStrictEqual(changes);
  });
});
