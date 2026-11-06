import { mkdirSync, renameSync, symlinkSync } from "node:fs";
import { join } from "node:path";

import * as fc from "fast-check";
import { expect, test } from "vitest";

import { canCoexist, filePath } from "../test/file-names";
import { commitAll, inRepository, runGit, timeout, writeFile } from "../test/repository";
import { beyondSymlinks } from "./symlinks";

// The directories the path is in, from the outermost.
function directoriesOf(path: string): string[] {
  const names = path.split("/");

  return names.slice(1).map((_, index) => names.slice(0, index + 1).join("/"));
}

// Files, and some of the directories they're in, which become symlinks.
const tree = fc
  .array(filePath, { minLength: 1, maxLength: 6 })
  .filter(canCoexist)
  .chain((paths) =>
    fc.record({
      paths: fc.constant(paths),
      linked: fc.subarray([...new Set(paths.flatMap(directoriesOf))]),
    }),
  );

// Moves each directory into the git directory, outermost first, and puts a symlink to where it
// went in its place, through which its files are still there. One in a directory moved before
// went with it.
function link(repository: string, directories: readonly string[]): void {
  const moved = join(repository, ".git", "moved");

  mkdirSync(moved);

  for (const [index, directory] of directories.toSorted().entries()) {
    const linkedBefore = directories.some((other) => directory.startsWith(`${other}/`));

    if (!linkedBefore) {
      renameSync(join(repository, directory), join(moved, `${index}`));
      symlinkSync(join(moved, `${index}`), join(repository, directory));
    }
  }
}

// The files git status lists as deleted.
function deleted(repository: string): string[] {
  return runGit(repository, ["status", "--porcelain", "--untracked-files=no", "-z"])
    .split("\0")
    .flatMap((entry) => (entry.startsWith(" D ") ? [entry.slice(3)] : []));
}

test(
  "finds exactly the files git takes for deleted once a directory they're in is a symlink, though they're still there through it",
  async () => {
    await fc.assert(
      fc.asyncProperty(tree, async ({ paths, linked }) => {
        await inRepository(async (repository) => {
          for (const path of paths) {
            writeFile(repository, path, "");
          }

          commitAll(repository);
          link(repository, linked);

          const beyond = await beyondSymlinks(repository, paths);

          expect([...beyond].toSorted()).toStrictEqual(deleted(repository).toSorted());
        });
      }),
      {
        examples: [
          [{ paths: ["a/b/c", "a/d", "e"], linked: ["a/b"] }],
          [{ paths: ["a/b/c", "a/d", "e"], linked: ["a", "a/b"] }],
        ],
      },
    );
  },
  timeout,
);
