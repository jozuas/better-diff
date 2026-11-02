import { readdirSync, readFileSync, realpathSync, watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import { watchDirectories } from "./directories";
import { Ignored } from "./ignored";
import { headRefOf, isIn, repositoryOf } from "./repository";
import type { Repository } from "./repository";
import { watchDirectory } from "./watcher";
import type { WatchPath } from "./watcher";

function watchPath(path: string, recursive: boolean, changed: Parameters<WatchPath>[2]): FSWatcher {
  return watch(path, { recursive }, (event, name) => {
    changed(name, event);
  });
}

// The platforms on which Node watches a directory and everything in it through one handle the
// system gives it.
const treesWatched = new Set<NodeJS.Platform>(["darwin", "win32"]);

function isAtOrIn(path: string, directory: string): boolean {
  return path === directory || isIn(path, directory);
}

// The worktree a record of the git directory names, by the path of its `.git` file, which can be
// relative to the record, and ends in a newline that leaving out the file's name leaves out too.
// Undefined where it's gone.
function worktreeOf(record: string): string | undefined {
  try {
    const gitFile = readFileSync(join(record, "gitdir"), "utf8");

    return realpathSync(dirname(resolve(record, gitFile)));
  }
  // Stryker disable next-line BlockStatement: an empty catch has it return undefined all the same.
  catch {
    return undefined;
  }
}

// The repository's other worktrees in the worktree, by the records the git directory they share
// keeps of them.
function worktreesIn({ top, common }: Repository): string[] {
  const records = join(common, "worktrees");

  try {
    return readdirSync(records)
      .map((name) => worktreeOf(join(records, name)))
      .filter((worktree): worktree is string => worktree !== undefined && isIn(worktree, top));
  } catch {
    // Stryker disable next-line ArrayDeclaration: where there are no records, no path is in a worktree of anything else either.
    return [];
  }
}

// What git status reads in a git directory that isn't the repository's own, such as a
// submodule's, by the names on the path to it there, which can run through the git directories of
// submodules it holds: its index, HEAD, branches, packed refs, reftables, configs and excludes. Not
// its objects or other logs, nor the cookies its file system monitor writes as git status reads.
function readsInGitDirectory(names: readonly string[]): boolean {
  const name = names.at(-1);

  return (
    name === undefined ||
    ["index", "HEAD", "packed-refs", "config", "config.worktree"].includes(name) ||
    (names.at(-2) === "info" && name === "exclude") ||
    names.includes("reftable") ||
    names.some((parent, index) => parent === "refs" && names[index + 1] === "heads")
  );
}

// Whether git status reads what's at the path, as far as the version goes. In the worktree,
// anything but what's deeper than a name in another of the repository's worktrees, which git status
// takes for a repository of its own, and what git status doesn't read in a git directory there,
// such as a submodule's. In the worktree's git directories, which can hold the worktree, as a bare
// repository's do, the worktree's own index, HEAD and config, the ref HEAD names, the reftables,
// the packed refs, the config, the excludes, and what git status reads in the submodules' git
// directories. Not the objects and logs git writes, the cookies its file system monitor writes as
// git status reads, the other worktrees' indexes, branches and configs, which change whenever git
// runs in them, or the refs a fetch brings. A directory itself, which a platform that doesn't say
// what changed in it names, is read.
function readerOf(repository: Repository): (path: string) => boolean {
  const { top, git: gitDirectory, common } = repository;

  const files = new Set([
    join(gitDirectory, "index"),
    join(gitDirectory, "HEAD"),
    join(gitDirectory, "config.worktree"),
    join(common, "packed-refs"),
    join(common, "config"),
    join(common, "info", "exclude"),
  ]);

  const reftables = [join(gitDirectory, "reftable"), join(common, "reftable")];
  const modules = join(common, "modules");
  const refs = join(common, "refs");
  const records = join(common, "worktrees");
  let worktrees = worktreesIn(repository);

  function inGitDirectory(path: string): boolean {
    return [gitDirectory, common].some(
      (directory) => isAtOrIn(path, directory) && (isIn(directory, top) || !isAtOrIn(path, top)),
    );
  }

  function readsInWorktree(path: string): boolean {
    if (
      worktrees.some((worktree) => isIn(path, worktree) && relative(worktree, path).includes(sep))
    ) {
      return false;
    }

    const names = relative(top, path).split(sep);
    const dotGit = names.indexOf(".git");

    return dotGit === -1 || readsInGitDirectory(names.slice(dotGit + 1));
  }

  return (path) => {
    // As a worktree is added, moved or removed, which writes the file in its record that names it,
    // and not as git writes the rest of it, such as its index, whenever it runs there.
    // Stryker disable next-line ConditionalExpression,EqualityOperator,LogicalOperator: reading the records after more changes only takes longer.
    if (basename(path) === "gitdir" && dirname(dirname(path)) === records) {
      worktrees = worktreesIn(repository);
    }

    if (!inGitDirectory(path)) {
      return readsInWorktree(path);
    }

    return (
      path === gitDirectory ||
      path === common ||
      files.has(path) ||
      reftables.some((reftable) => isAtOrIn(path, reftable)) ||
      (isIn(path, modules) && readsInGitDirectory(relative(modules, path).split(sep))) ||
      // HEAD names a ref in the refs, so it's read only as one of them changes, and not as git
      // writes an object.
      (isIn(path, refs) && path === headRefOf(repository))
    );
  };
}

// Watches each directory and everything in it.
function watchTrees(
  trees: readonly string[],
  changed: (path: string) => void,
  failed: () => void,
  watchWhole: WatchPath,
): () => void {
  const watchers: FSWatcher[] = [];

  try {
    for (const tree of trees) {
      const watcher = watchDirectory(tree, true, watchWhole, changed, failed);

      if (watcher === undefined) {
        failed();
      } else {
        watchers.push(watcher);
      }
    }
  } catch {
    failed();
  }

  return () => {
    for (const watcher of watchers) {
      watcher.close();
    }
  };
}

// Calls `changed` with the path of each file that changes in the directory's repository, or in its
// git directories, where git status reads it, unless it's a file in the worktree git ignores, until
// the function it gives is called, and `failed` where it can't watch them, or once it no longer
// can.
export async function watchRepository(
  directory: string,
  platform: NodeJS.Platform,
  changed: (path: string) => void,
  failed: () => void,
  watchWith: WatchPath = watchPath,
): Promise<() => void> {
  const repository = await repositoryOf(directory).catch(() => null);

  if (repository === null) {
    failed();

    return () => {};
  }

  const { top } = repository;
  const reads = readerOf(repository);
  const ignored = new Ignored(top, changed);

  // What git ignores changes with the index, the excludes and the configs, in the git directories,
  // and with the .gitignore files. git ignores no directory that holds a file in the index, such as
  // one the watch on Linux tells of as it starts to watch it. Where HEAD can't be read, it can't
  // tell whether git status reads a ref.
  function told(path: string): void {
    try {
      if (!reads(path)) {
        return;
      }

      const names = relative(top, path).split(sep);

      if (!isIn(path, top) || names.includes(".git") || names.at(-1) === ".gitignore") {
        ignored.forget();
        changed(path);
      } else {
        ignored.heard(path);
      }
    } catch {
      failed();
    }
  }

  if (treesWatched.has(platform)) {
    const directories = [...new Set([top, repository.git, repository.common])];

    // The worktree, with the main worktree's git directory in it, and the git directories outside
    // it, but each only once: a linked worktree's own is in the one they share.
    const stopTrees = watchTrees(
      directories.filter((tree) => !directories.some((other) => isIn(tree, other))),
      told,
      failed,
      watchWith,
    );

    return () => {
      ignored.stop();
      stopTrees();
    };
  }

  const stopDirectories = await watchDirectories(repository, told, failed, watchWith);

  return () => {
    ignored.stop();
    stopDirectories();
  };
}
