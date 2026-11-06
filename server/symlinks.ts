import { lstat } from "node:fs/promises";
import { join } from "node:path";

// The paths that are symlinks in the worktree at the directory.
export async function symlinksAmong(
  directory: string,
  paths: readonly string[],
): Promise<Set<string>> {
  const symlinks = await Promise.all(
    paths.map(async (path) => {
      const stats = await lstat(join(directory, path)).catch(() => {});

      return stats?.isSymbolicLink() === true;
    }),
  );

  return new Set(paths.filter((_, index) => symlinks[index] === true));
}

// The directories the path is in: `a` and `a/b` for `a/b/c`.
function directoriesOf(path: string): string[] {
  const names = path.split("/");

  return names.slice(1).map((_, index) => names.slice(0, index + 1).join("/"));
}

// The paths with a symlink among the directories they're in, in the worktree at the directory.
// git takes the file at one for deleted, as it never looks beyond a symlink.
export async function beyondSymlinks(
  directory: string,
  paths: readonly string[],
): Promise<Set<string>> {
  const symlinks = await symlinksAmong(directory, [...new Set(paths.flatMap(directoriesOf))]);

  return new Set(paths.filter((path) => directoriesOf(path).some((inner) => symlinks.has(inner))));
}
