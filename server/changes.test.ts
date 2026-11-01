import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import { changesRpc } from "../shared/changes";
import { canCoexist, filePath } from "../test/file-names";
import {
  commitAll,
  deleteFile,
  inRepository,
  runGit,
  timeout,
  writeFile,
} from "../test/repository";
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
    commitAll(repository);
    runGit(repository, ["mv", "? a", "b"]);

    await expect(listChanges({ directory: repository })).resolves.toStrictEqual({
      modified: [],
      untracked: [],
      staged: ["b"],
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
