import type { FSWatcher } from "node:fs";
import { lstat } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

import { GitDirectories } from "./git-directories";
import { listedIn } from "./listing";
import { isIn, repositoryOf } from "./repository";
import type { Repository } from "./repository";
import { watchDirectory } from "./watcher";
import type { WatchPath } from "./watcher";

// At most this many directories' paths, which can each be 4096 bytes long, are less than the
// 128 KiB of arguments Linux starts a process with at the least. Past it, git lists the whole
// worktree.
const mostListed = 20;

// How long before it changed a directory's modification time can say it changed, as on a file
// system that keeps it in whole seconds, or in two, as FAT does.
const lag = 2000;

// Watches what git status reads in the git directories, each directory in the worktree git lists
// files in, and each that appears in one, unless git ignores it, telling of each such directory
// once it watches it, as a file in it could have changed before. A directory where a watched one
// was is a new one: Linux stops watching a directory once it's deleted. Where a .gitignore file,
// the excludes, the configs or the index change, git can list files in a directory that it watches
// no file in, so it's listed again. Each submodule checked out is a worktree of its own, and the
// directory of each that isn't is watched, to see it checked out.
class Worktree {
  readonly #repository: Repository;
  readonly #watchPath: WatchPath;
  readonly #changed: (path: string) => void;
  readonly #failed: () => void;
  readonly #git: GitDirectories;
  // The directories it watches in the worktree, by their paths.
  readonly #watchers = new Map<string, FSWatcher>();
  // The submodules the index has, and those of them checked out, by their paths.
  readonly #gitlinks = new Set<string>();
  readonly #submodules = new Map<string, Worktree>();
  // The paths that changed since they were last looked at, and whether a look at them is due.
  readonly #seen = new Set<string>();
  #lookDue = false;
  #looking = Promise.resolve();
  #stopped = false;
  // When it may list the index's files again, by `performance.now()`, and what has it list them then.
  #indexDue = -Infinity;
  #indexWaiting: ReturnType<typeof setTimeout> | undefined;

  constructor(
    repository: Repository,
    watchPath: WatchPath,
    changed: (path: string) => void,
    failed: () => void,
  ) {
    this.#repository = repository;
    this.#watchPath = watchPath;
    this.#changed = changed;
    this.#failed = failed;

    this.#git = new GitDirectories(
      repository,
      watchPath,
      {
        changed,
        heard: (path) => {
          this.#hear(path);
        },
      },
      failed,
    );
  }

  // Watches the directories in the git directories that hold what git status reads there, and the
  // directories in the worktree git lists files in, telling of each in the worktree where `tell`.
  async start(tell: boolean): Promise<void> {
    this.#git.start();
    await this.#watchListed([], false, tell);
  }

  stop(): void {
    this.#stopped = true;
    clearTimeout(this.#indexWaiting);
    this.#git.stop();

    for (const watcher of this.#watchers.values()) {
      watcher.close();
    }

    for (const submodule of this.#submodules.values()) {
      submodule.stop();
    }
  }

  // Watches the directories git lists files in, as `listedIn` takes them, and lists again in each
  // it started to watch that changed since git started to list, as a directory that appears in one
  // after git lists it, but before it's watched, is one only a listing after finds.
  async #watchListed(
    directories: readonly string[],
    indexOnly: boolean,
    tell: boolean,
  ): Promise<void> {
    const since = Date.now() - lag;
    const listed = await listedIn(this.#repository.top, directories, indexOnly);
    const started = this.#watch(listed.directories, tell);

    await this.#watchSubmodules(
      listed.submodules.map((submodule) => join(this.#repository.top, submodule)),
      tell,
    );

    await this.#listAgain(await this.#changedSince(started, since));
  }

  // Lists again in the directories, relative to the worktree, telling of each it starts to watch, or
  // in the whole worktree where one is its own directory, or where there are more than git can be
  // given.
  async #listAgain(directories: readonly string[]): Promise<void> {
    // Stryker disable next-line EqualityOperator: at the limit, either listing lists in the directories, as a process can start with their paths.
    if (directories.includes("") || directories.length > mostListed) {
      await this.#watchListed([], false, true);
    } else if (directories.length > 0) {
      await this.#watchListed(
        directories.map((directory) => `${directory}/`),
        false,
        true,
      );
    }
  }

  // The directories, relative to the worktree, whose modification time says they changed since
  // then.
  async #changedSince(directories: readonly string[], since: number): Promise<string[]> {
    const changed = await Promise.all(
      directories.map(async (directory) => {
        const stats = await lstat(join(this.#repository.top, directory)).catch(() => null);

        // Stryker disable next-line EqualityOperator: a directory changed in the very millisecond the lag allows for could as well have changed before.
        return stats !== null && stats.mtimeMs >= since;
      }),
    );

    return directories.filter((_, index) => changed[index] === true);
  }

  // Watches the directories, relative to the worktree, that it doesn't yet, and says which it
  // started to watch.
  #watch(directories: Iterable<string>, tell: boolean): string[] {
    return [...directories].filter((directory) => {
      const path = join(this.#repository.top, directory);

      if (!this.#stopped && !this.#watchers.has(path)) {
        const watcher = watchDirectory(
          path,
          false,
          this.#watchPath,
          (changed, event) => {
            this.#changed(changed);

            // A directory it or a submodule watches whose attributes alone changed is still the
            // one watched.
            if (
              event === "rename" ||
              !(this.#watchers.has(changed) || this.#submodules.has(changed))
            ) {
              this.#hear(changed);
            }
          },
          this.#failed,
        );

        if (watcher !== undefined) {
          this.#watchers.set(path, watcher);

          if (tell) {
            this.#changed(path);
          }

          return true;
        }
      }

      return false;
    });
  }

  // Watches each submodule at the paths that's checked out as a worktree of its own, unless it
  // does already, and the directory of each that isn't. git finds the repository a submodule that
  // isn't checked out is in, and none where its directory is gone. Where `tell`, tells of each
  // directory it starts to watch in a submodule, as what's in it could have changed before.
  async #watchSubmodules(paths: readonly string[], tell: boolean): Promise<void> {
    await Promise.all(
      paths.map(async (path) => {
        this.#gitlinks.add(path);

        const repository = this.#submodules.has(path)
          ? null
          : await repositoryOf(path).catch(() => null);

        if (this.#stopped || repository === null || this.#submodules.has(path)) {
          return;
        }

        if (repository.top !== path) {
          this.#watch([relative(this.#repository.top, path)], tell);

          return;
        }

        const submodule = new Worktree(repository, this.#watchPath, this.#changed, this.#failed);

        this.#stopWatching(new Set([path]));
        this.#submodules.set(path, submodule);
        await submodule.start(tell);
      }),
    );
  }

  // Looks at the paths that changed once it has looked at those before, all at once, however many
  // change in the meantime, as a checkout changes thousands.
  #hear(path: string): void {
    this.#seen.add(path);

    // Stryker disable next-line ConditionalExpression: a look at no path changes nothing, it only takes longer.
    if (!this.#lookDue) {
      // Stryker disable next-line BooleanLiteral: a look at no path changes nothing, it only takes longer.
      this.#lookDue = true;
      this.#looking = this.#lookAfter(this.#looking);
    }
  }

  async #lookAfter(previous: Promise<void>): Promise<void> {
    await previous;
    this.#lookDue = false;

    // Stryker disable next-line ConditionalExpression: once stopped, it watches nothing a look finds, and only takes longer.
    if (!this.#stopped) {
      await this.#look().catch(this.#failed);
    }
  }

  async #look(): Promise<void> {
    const paths = [...this.#seen];

    this.#seen.clear();
    this.#stopWatching(new Set(paths));

    const directories = await Promise.all(
      paths.map(async (path) => {
        const directory = await this.#toList(path);

        return directory;
      }),
    );

    if (paths.some((path) => this.#git.ignores.has(path))) {
      await this.#watchListed([], false, true);
    } else {
      await this.#listAgain(directories.flat());

      if (paths.includes(this.#git.index)) {
        await this.#listIndex();
      }
    }

    // A submodule's `.git` appears in its directory as it's checked out.
    await this.#watchSubmodules(
      [...new Set(paths.map((path) => dirname(path)))].filter((directory) =>
        this.#gitlinks.has(directory),
      ),
      true,
    );
  }

  // Lists the index's files no sooner than a second after it last did, or ten times as long as
  // that took, so that git writing the index over and over, as staging hunk by hunk does, has them
  // listed a tenth of the time at most.
  async #listIndex(): Promise<void> {
    const started = performance.now();

    if (this.#stopped) {
      return;
    }

    if (started < this.#indexDue) {
      this.#indexWaiting ??= setTimeout(() => {
        this.#indexWaiting = undefined;
        this.#hear(this.#git.index);
      }, this.#indexDue - started);

      return;
    }

    await this.#watchListed([], true, true);

    const ended = performance.now();

    this.#indexDue = ended + Math.max(1000, 10 * (ended - started));
  }

  // Says what directory to list again where a path changed, relative to the worktree: the path,
  // where it's a directory now, which appeared or replaced another, and the directory of a
  // .gitignore file. None for the index, the excludes or the configs, which are files.
  async #toList(path: string): Promise<string[]> {
    if (basename(path) === ".gitignore") {
      return [relative(this.#repository.top, dirname(path))];
    }

    // False where nothing is at the path any more.
    const stats = await lstat(path).catch((): false => false);

    return stats !== false && stats.isDirectory() ? [relative(this.#repository.top, path)] : [];
  }

  // Stops watching what was at the paths, the directories in it, and the submodules.
  #stopWatching(paths: ReadonlySet<string>): void {
    const outside = dirname(this.#repository.top);

    function isAtOrIn(directory: string): boolean {
      for (let at = directory; isIn(at, outside); at = dirname(at)) {
        if (paths.has(at)) {
          return true;
        }
      }

      return false;
    }

    for (const [directory, watcher] of this.#watchers) {
      if (isAtOrIn(directory)) {
        watcher.close();
        this.#watchers.delete(directory);
      }
    }

    for (const [directory, submodule] of this.#submodules) {
      if (isAtOrIn(directory)) {
        submodule.stop();
        this.#submodules.delete(directory);
      }
    }
  }
}

// Watches the worktree as Node can on a platform such as Linux, where watching a directory and
// everything in it means watching each directory in it on its own: a large repository can have tens
// of thousands, most of them ignored, as in node_modules. So it watches only the directories git
// lists files in, and a directory that appears in one of them, unless git ignores it, and in the git
// directories, the directories that hold what git status reads there.
export async function watchDirectories(
  repository: Repository,
  changed: (path: string) => void,
  failed: () => void,
  watchPath: WatchPath,
): Promise<() => void> {
  const worktree = new Worktree(repository, watchPath, changed, failed);

  await worktree.start(false).catch(failed);

  return () => {
    worktree.stop();
  };
}
