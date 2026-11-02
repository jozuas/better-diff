import type { FSWatcher } from "node:fs";
import { dirname, join } from "node:path";

import { headRefOf, isIn } from "./repository";
import type { Repository } from "./repository";
import { watchDirectory } from "./watcher";
import type { WatchPath } from "./watcher";

// Watches the directories that hold what git status reads in a repository's git directories, on a
// platform such as Linux, where each directory is watched on its own: the git directories
// themselves, which hold the index, HEAD, the packed refs and the configs, the excludes' directory,
// the reftables' directories, and the directories on the way to the ref HEAD names. It watches each
// as it appears, and anew where it went or was replaced, and once HEAD names another ref, those on
// the way to that one instead. Calls `changed` with the path of what changes in them, and `heard`
// with the index's, or with that of what says which files git ignores, after a change to which git
// can list other files.
export class GitDirectories {
  readonly index: string;
  // What says which files git ignores, besides the .gitignore files: the excludes, and the configs,
  // which can name another excludes file, as core.excludesFile does.
  readonly ignores: ReadonlySet<string>;
  readonly #repository: Repository;
  readonly #watchPath: WatchPath;
  readonly #changed: (path: string) => void;
  readonly #heard: (path: string) => void;
  readonly #failed: () => void;
  readonly #watchers = new Map<string, FSWatcher>();

  constructor(
    repository: Repository,
    watchPath: WatchPath,
    { changed, heard }: { changed: (path: string) => void; heard: (path: string) => void },
    failed: () => void,
  ) {
    this.index = join(repository.git, "index");

    this.ignores = new Set([
      join(repository.common, "info", "exclude"),
      join(repository.common, "config"),
      join(repository.git, "config.worktree"),
    ]);

    this.#repository = repository;
    this.#watchPath = watchPath;
    this.#changed = changed;
    this.#heard = heard;
    this.#failed = failed;
  }

  start(): void {
    this.#watch(false);
  }

  stop(): void {
    for (const watcher of this.#watchers.values()) {
      watcher.close();
    }
  }

  #directories(): Set<string> {
    const { git: gitDirectory, common } = this.#repository;
    const ref = headRefOf(this.#repository);

    const directories = new Set([
      gitDirectory,
      common,
      join(common, "info"),
      join(gitDirectory, "reftable"),
      join(common, "reftable"),
    ]);

    for (
      let directory = ref === undefined ? common : dirname(ref);
      isIn(directory, common);
      directory = dirname(directory)
    ) {
      directories.add(directory);
    }

    return directories;
  }

  // Watches the directories it should that it doesn't yet, and stops watching those it no longer
  // should. Where `tell`, tells of the index, what says which files git ignores, or the ref HEAD
  // names, in each it starts to watch, as it could have changed before.
  #watch(tell: boolean): void {
    const wanted = this.#directories();

    for (const [directory, watcher] of this.#watchers) {
      if (!wanted.has(directory)) {
        watcher.close();
        this.#watchers.delete(directory);
      }
    }

    const started = new Set(
      [...wanted].filter((directory) => {
        const watcher = this.#watchers.has(directory)
          ? undefined
          : watchDirectory(
              directory,
              false,
              this.#watchPath,
              (path) => {
                this.#changedIn(path);
              },
              this.#failed,
            );

        if (watcher !== undefined) {
          this.#watchers.set(directory, watcher);
        }

        return watcher !== undefined;
      }),
    );

    for (const path of [this.index, ...this.ignores, headRefOf(this.#repository)]) {
      if (tell && path !== undefined && started.has(dirname(path))) {
        this.#told(path);
      }
    }
  }

  #told(path: string): void {
    this.#changed(path);

    if (path === this.index || this.ignores.has(path)) {
      this.#heard(path);
    }
  }

  // A directory it watches that changed could be a new one where one went, and a change, as to HEAD,
  // can have it watch others, or no longer watch some.
  #changedIn(path: string): void {
    this.#told(path);
    this.#watchers.get(path)?.close();
    this.#watchers.delete(path);

    try {
      this.#watch(true);
    } catch {
      this.#failed();
    }
  }
}
