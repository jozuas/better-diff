import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import { changesRpc } from "../shared/changes";
import { canCoexist, filePath } from "../test/file-names";
import { deleteFile, inRepository, runGit, timeout, writeFile } from "../test/repository";
import { listChanges } from "./changes";

type Changes = RpcOutput<typeof changesRpc>;

// A file's version in HEAD, in the index and in the worktree, null where it's absent.
interface Versions {
  path: string;
  head: 1 | null;
  index: 1 | 2 | null;
  worktree: 1 | 2 | 3 | null;
}

const versions = fc
  .uniqueArray(
    fc.record({
      path: filePath,
      head: fc.constantFrom(1, null),
      index: fc.constantFrom(1, 2, null),
      worktree: fc.constantFrom(1, 2, 3, null),
    }),
    { selector: ({ path }) => path, maxLength: 24 },
  )
  .filter((files) => canCoexist(files.map(({ path }) => path)));

function writeVersions(
  repository: string,
  files: readonly Versions[],
  tree: "head" | "index" | "worktree",
): void {
  for (const [number, file] of files.entries()) {
    const version = file[tree];

    if (version === null) {
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

// What git status reports, worked out from each file's versions.
function expectedChanges(files: readonly Versions[]): Changes {
  return {
    modified: paths(files, ({ index, worktree }) => index !== null && worktree !== index),
    untracked: paths(files, ({ index, worktree }) => index === null && worktree !== null),
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
  "lists what git status does: modified, untracked and staged files",
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
