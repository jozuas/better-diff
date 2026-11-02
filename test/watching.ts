import { realpathSync, watch } from "node:fs";
import type { FSWatcher, WatchEventType } from "node:fs";
import { join } from "node:path";

import { expect, vi } from "vitest";

import { watchRepository } from "../server/watch";
import type { WatchPath } from "../server/watcher";
import { writeFile } from "./repository";

export interface Watching {
  // The paths it told of.
  paths: string[];
  // How many times it said it failed.
  failed: () => number;
  stop: () => void;
}

// Watches the repository as `watchRepository` does on the platform, and stops once it tells of
// `stopAt`, if given.
export async function watching(
  directory: string,
  platform: NodeJS.Platform,
  watchPath?: WatchPath,
  stopAt?: string,
): Promise<Watching> {
  const paths: string[] = [];
  let failed = 0;
  // Holds the watch's stop once it's started.
  const stops: (() => void)[] = [];

  // Stops it once, though it be told to again.
  function stop(): void {
    for (const stopWatching of stops.splice(0)) {
      stopWatching();
    }
  }

  stops.push(
    await watchRepository(
      directory,
      platform,
      (path) => {
        paths.push(path);

        if (path === stopAt) {
          stop();
        }
      },
      () => {
        failed += 1;
      },
      watchPath,
    ),
  );

  return { paths, failed: () => failed, stop };
}

// Writes the file in the directory until the watch tells of it. The system starts watching only
// after Node's watch has returned, so the first changes can go untold.
export async function toldOf(
  paths: readonly string[],
  directory: string,
  path: string,
): Promise<void> {
  await vi.waitFor(
    () => {
      writeFile(directory, path, "a\n");

      expect(paths).toContain(join(realpathSync(directory), path));
    },
    { timeout: 4000 },
  );
}

export interface Watchers {
  watchPath: WatchPath;
  // The paths of the watchers it started that are still open.
  open: () => string[];
  // The watchers of the path still open.
  openAt: (path: string) => FSWatcher[];
  // Each watcher it started.
  started: () => FSWatcher[];
  // Whether each watcher it started watches everything in its directory.
  recursive: () => boolean[];
}

// Watches as Node does, keeping track of each watcher, and failing to start more than `most`.
export function watchers(most = Infinity): Watchers {
  const started: { watcher: FSWatcher; recursive: boolean }[] = [];
  const open = new Map<FSWatcher, string>();

  function watchPath(
    path: string,
    recursive: boolean,
    changed: Parameters<WatchPath>[2],
  ): FSWatcher {
    if (started.length >= most) {
      throw new Error("ENOSPC: System limit for number of file watchers reached");
    }

    const watcher = watch(path, { recursive }, (event, name) => {
      changed(name, event);
    });

    started.push({ watcher, recursive });
    open.set(watcher, path);
    watcher.on("close", () => {
      open.delete(watcher);
    });

    return watcher;
  }

  return {
    watchPath,
    open: () => [...open.values()],
    openAt: (path) => [...open].flatMap(([watcher, at]) => (at === path ? [watcher] : [])),
    started: () => started.map(({ watcher }) => watcher),
    recursive: () => started.map(({ recursive }) => recursive),
  };
}

export interface Refusing {
  watchPath: WatchPath;
  // Has it watch the directory from then on.
  allow: () => void;
}

// Watches as `watchPath` does, but fails to watch the directory, as Node does one it can't read,
// or with the error code given, until it's allowed to.
export function refusing(watchPath: WatchPath, directory: string, code = "EACCES"): Refusing {
  let refuses = true;

  return {
    watchPath: (path, recursive, changed) => {
      if (refuses && path === directory) {
        throw Object.assign(new Error(`${code}: watch`), { code });
      }

      return watchPath(path, recursive, changed);
    },
    allow: () => {
      refuses = false;
    },
  };
}

export interface Hiding {
  watchPath: WatchPath;
  // Has the watcher of the directory tell of what has the name in it, as the system would: that it
  // appeared, went or was replaced, unless told it only changed.
  tell: (directory: string, name: string | null, event?: WatchEventType) => void;
}

// Watches as `watchPath` does, but hides the changes to the paths given, as Linux does what
// changed in a directory before it was watched.
export function hiding(watchPath: WatchPath, hidden: readonly string[] = []): Hiding {
  const tells = new Map<string, Parameters<WatchPath>[2]>();

  return {
    watchPath: (path, recursive, changed) => {
      tells.set(path, changed);

      return watchPath(path, recursive, (name, event) => {
        if (!hidden.includes(join(path, name ?? ""))) {
          changed(name, event);
        }
      });
    },
    tell: (directory, name, event = "rename") => {
      tells.get(directory)?.(name, event);
    },
  };
}

// Watches as `watchPath` does, but first does what `act` does, each time it's about to watch the
// directory.
export function beforeWatching(
  watchPath: WatchPath,
  directory: string,
  act: () => void,
): WatchPath {
  return (path, recursive, changed) => {
    if (path === directory) {
      act();
    }

    return watchPath(path, recursive, changed);
  };
}

// Watches as `watchPath` does, but then does what `act` does, each time it has started to watch the
// directory.
export function afterWatching(watchPath: WatchPath, directory: string, act: () => void): WatchPath {
  return (path, recursive, changed) => {
    const watcher = watchPath(path, recursive, changed);

    if (path === directory) {
      act();
    }

    return watcher;
  };
}
