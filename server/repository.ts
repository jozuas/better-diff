import { readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import { git } from "./git";

// A worktree, the git directory of its own, which holds its index and HEAD, and the one its
// repository's worktrees share, which holds the refs and the excludes. Each is absolute, with
// symbolic links resolved, as the paths of what changes in them are.
export interface Repository {
  top: string;
  git: string;
  common: string;
}

export async function repositoryOf(directory: string): Promise<Repository> {
  const output = await git(directory, "rev-parse", [
    "--path-format=absolute",
    "--show-toplevel",
    "--git-dir",
    "--git-common-dir",
  ]);

  // git prints each path on a line, and then the `--` that ends the options. It separates the
  // directories in a path with `/` on Windows too, where the paths of what changes have `\`.
  const [top = directory, gitDirectory = top, common = gitDirectory] = output
    .toString()
    .split("\n")
    .map((path) => resolve(path));

  return { top, git: gitDirectory, common };
}

// Whether the path is in the directory, and isn't the directory itself. Of directories, the root
// alone ends in a separator, as `/` does.
export function isIn(path: string, directory: string): boolean {
  const start = directory.endsWith(sep) ? directory : `${directory}${sep}`;

  return path.length > start.length && path.startsWith(start);
}

// The path of the ref HEAD names, as the branch checked out, unless HEAD names a commit, as it does
// when detached. Throws where HEAD can't be read.
export function headRefOf({ git: gitDirectory, common }: Repository): string | undefined {
  const head = readFileSync(join(gitDirectory, "HEAD")).toString();

  // Stryker disable next-line StringLiteral: every HEAD starts with nothing, and the path of a commit's name is no ref's.
  return head.startsWith("ref: ")
    ? join(common, ...head.slice("ref: ".length).trimEnd().split("/"))
    : undefined;
}
