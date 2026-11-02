import type { FSWatcher, WatchEventType } from "node:fs";
import { resolve } from "node:path";

import { z } from "zod";

// Watches a directory, and everything in it where `recursive`, calling back with the path of what
// changes in it, relative to it, where the platform says which, and whether something there
// appeared, went or was replaced, or only changed.
export type WatchPath = (
  path: string,
  recursive: boolean,
  changed: (name: string | null, event: WatchEventType) => void,
) => FSWatcher;

// How Node fails to watch a directory that's gone, as where it was deleted after git listed it, or
// where its name isn't UTF-8, which git's output decoded as UTF-8 doesn't keep, or that can't be
// read. It's left unwatched: a check every half a minute finds what changes in it.
const unwatchable = z.object({ code: z.enum(["ENOENT", "ENOTDIR", "EACCES"]) });

// Watches the directory, and everything in it where `recursive`, calling back with the path of
// what changes in it, unless it can't be watched. Linux names a change to the directory itself by
// the directory's own name, as it would a change to what has that name in it: either way, what
// changed is in the directory, or is it.
export function watchDirectory(
  directory: string,
  recursive: boolean,
  watchPath: WatchPath,
  changed: (path: string, event: WatchEventType) => void,
  failed: () => void,
): FSWatcher | undefined {
  try {
    // A platform that doesn't say which file changed has the directory itself changed.
    const watcher = watchPath(directory, recursive, (name, event) => {
      changed(resolve(directory, name ?? directory), event);
    });

    watcher.on("error", failed);

    return watcher;
  } catch (error) {
    if (unwatchable.safeParse(error).success) {
      return undefined;
    }

    throw error;
  }
}
