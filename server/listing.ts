import { readdir } from "node:fs/promises";
import { join, posix } from "node:path";

import { git } from "./git";
import { ignoredOf } from "./ignored";

// The directory of a path git lists, relative to the worktree, or the directory itself where the
// path ends in `/`. Empty for the worktree's own.
function parentOf(path: string): string {
  return path.slice(0, Math.max(0, path.lastIndexOf("/")));
}

// Stryker disable next-line ArrayDeclaration: a path git would list in the worktree's own directory adds no directory to those listed.
const noListings: readonly Promise<Buffer>[] = [];

// The directories in the directory, relative to the worktree, unless it's a repository of its own,
// which git lists by its directory alone. None where it's gone, or can't be read.
async function directoriesIn(top: string, directory: string): Promise<string[]> {
  const entries = await readdir(join(top, directory), { withFileTypes: true }).catch(() => []);
  const isRepository = entries.some(({ name }) => name === ".git");

  return entries
    .filter((entry) => !isRepository && entry.isDirectory())
    .map(({ name }) => posix.join(directory, name));
}

// Adds to the directories listed those in the untracked directories given, those in them, and so
// on, that git doesn't ignore, relative to the worktree: git lists an untracked directory by its
// own path alone, though a file can appear in any of them, as in one `mkdir -p` makes. It never
// looks in one git ignores, which can hold thousands, as node_modules does.
async function addDirectoriesIn(
  top: string,
  directories: readonly string[],
  listed: Set<string>,
): Promise<void> {
  const inEach = await Promise.all(
    directories.map(async (directory) => {
      const inIt = await directoriesIn(top, directory);

      return inIt;
    }),
  );

  const found = inEach.flat();
  const ignored = await ignoredOf(top, found);
  const kept = found.filter((directory) => !ignored.has(directory));

  for (const directory of kept) {
    listed.add(directory);
  }

  if (kept.length > 0) {
    await addDirectoriesIn(top, kept, listed);
  }
}

interface Listed {
  // The directories git lists files in, and those they're in, relative to the worktree.
  directories: Set<string>;
  // The submodules' directories, relative to the worktree.
  submodules: string[];
}

// The worktree's own directory, empty, and the directories that hold the files git lists in the
// directories given, by their paths ending in `/`, or in the whole worktree where none is, and
// those they're in, relative to the worktree: the index's files, and unless `indexOnly`, the
// worktree's untracked files and directories that git doesn't ignore, and the directories in those
// that git doesn't ignore, such as empty ones. And the submodules the index has there.
export async function listedIn(
  top: string,
  directories: readonly string[],
  indexOnly: boolean,
): Promise<Listed> {
  const [index, ...others] = await Promise.all([
    git(top, "ls-files", ["--stage"], directories),
    ...(indexOnly
      ? noListings
      : [git(top, "ls-files", ["--others", "--exclude-standard", "--directory"], directories)]),
  ]);

  // `--stage` has `<mode> <object> <stage>\t` before each path, and 160000 is a submodule's mode.
  const entries = index
    .toString()
    .split("\0")
    .map((entry) => ({
      path: entry.slice(entry.indexOf("\t") + 1),
      submodule: entry.startsWith("160000 "),
    }));

  const listed = new Set<string>();
  const untracked = others.flatMap((listing) => listing.toString().split("\0"));

  // Each path ends in a NUL, after which the last is empty, which has the worktree's own directory.
  for (const path of [...entries.map((entry) => entry.path), ...untracked]) {
    for (let directory = parentOf(path); !listed.has(directory); directory = parentOf(directory)) {
      listed.add(directory);
    }
  }

  // git lists an untracked directory by its path ending in `/`, as it does a repository of its own.
  await addDirectoriesIn(
    top,
    // Stryker disable next-line MethodExpression,StringLiteral: a file holds no directory, looking in one only takes longer.
    untracked.filter((path) => path.endsWith("/")),
    listed,
  );

  return {
    directories: listed,
    submodules: entries.filter((entry) => entry.submodule).map((entry) => entry.path),
  };
}
