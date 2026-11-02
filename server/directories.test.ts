import { mkdirSync, realpathSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setImmediate, setTimeout } from "node:timers/promises";

import * as fc from "fast-check";
import { expect, test, vi } from "vitest";

import { canCoexist, filePath } from "../test/file-names";
import {
  commitAll,
  inDirectory,
  inRepository,
  runGit,
  timeout,
  writeFile,
} from "../test/repository";
import { beforeWatching, refusing, toldOf, watchers, watching } from "../test/watching";
import type { WatchPath } from "./watcher";

// How many times the watch told of the path.
function timesToldOf(paths: readonly string[], path: string): number {
  return paths.filter((told) => told === path).length;
}

// Telling of each directory as it starts to watch it would tell of the worktree's own, which no
// change before tells of: macOS, which stands in for Linux here, can tell of a change made just
// before a directory was watched.
test("tells of a change to a file in a directory git lists a file in, and not of the directories as it starts to watch them", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a/b/c", "c\n");
    commitAll(repository);
    writeFile(repository, "d/e", "e\n");

    const { paths, failed, stop } = await watching(repository, "linux");

    expect(paths).not.toContain(realpathSync(repository));

    await toldOf(paths, repository, join("a", "b", "c"));
    stop();

    expect(failed()).toBe(0);
  });
});

test.each([
  ["the index", [], ["index"]],
  ["a linked worktree's index", ["linked"], ["worktrees", "linked", "index"]],
])("tells of a change to %s", async (_, worktree, index) => {
  await inRepository(async (repository) => {
    runGit(repository, ["worktree", "add", "--quiet", "--orphan", "linked"]);

    const directory = join(repository, ...worktree);
    const { paths, stop } = await watching(directory, "linux");

    await toldOf(paths, directory, "a");
    runGit(directory, ["add", "a"]);
    await vi.waitFor(() => {
      expect(paths).toContain(join(realpathSync(repository), ".git", ...index));
    });
    stop();
  });
});

test("watches a directory that appears, and tells of it once it does", async () => {
  await inRepository(async (repository) => {
    await inDirectory(async (outside) => {
      writeFile(outside, "new/a/b", "b\n");

      const { paths, stop } = await watching(repository, "linux");
      const moved = join(realpathSync(repository), "new");

      await toldOf(paths, repository, "ready");
      renameSync(join(outside, "new"), moved);
      await vi.waitFor(() => {
        expect(timesToldOf(paths, moved)).toBe(2);
      });
      await toldOf(paths, repository, join("new", "a", "b"));
      stop();
    });
  });
});

test("doesn't watch a directory that appears where git ignores it", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, ".gitignore", "ignored/\n");

    const { paths, stop } = await watching(repository, "linux");

    await toldOf(paths, repository, "ready");
    writeFile(repository, "ignored/a", "a\n");
    await toldOf(paths, repository, join("new", "a"));
    writeFile(repository, "ignored/b", "b\n");
    await toldOf(paths, repository, join("new", "b"));
    await setTimeout(100);
    stop();

    expect(paths).not.toContain(join(realpathSync(repository), "ignored", "b"));
  });
});

test("stops watching a deleted directory and the directories in it, and no other", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a/b/c", "c\n");
    writeFile(repository, "ab/c", "c\n");

    const top = realpathSync(repository);
    const started = watchers();
    const { paths, stop } = await watching(repository, "linux", started.watchPath);

    await toldOf(paths, repository, "ready");
    rmSync(join(repository, "a"), { recursive: true });
    await vi.waitFor(
      () => {
        expect(started.open()).not.toContain(join(top, "a"));
        expect(started.open()).not.toContain(join(top, "a", "b"));
      },
      { timeout: 4000 },
    );

    const open = started.open();

    stop();
    await setImmediate();

    expect(open).toContain(join(top, "ab"));
    expect(started.open()).toStrictEqual([]);
  });
});

test("watches a directory anew where one was deleted and made again", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a/b", "b\n");
    commitAll(repository);

    const a = join(realpathSync(repository), "a");
    const started = watchers();
    const { paths, stop } = await watching(repository, "linux", started.watchPath);

    await toldOf(paths, repository, "ready");

    const [before] = started.openAt(a);

    rmSync(a, { recursive: true });
    mkdirSync(a);
    await vi.waitFor(
      () => {
        expect(started.openAt(a)).toHaveLength(1);
        expect(started.openAt(a)).not.toContain(before);
      },
      { timeout: 4000 },
    );
    await toldOf(paths, repository, join("a", "b"));
    stop();
  });
});

test("watches an empty directory git doesn't ignore, and one that appears", async () => {
  await inRepository(async (repository) => {
    mkdirSync(join(repository, "empty"));

    const top = realpathSync(repository);
    const started = watchers();
    const { paths, stop } = await watching(repository, "linux", started.watchPath);

    await toldOf(paths, repository, "ready");
    mkdirSync(join(repository, "new"));
    await vi.waitFor(() => {
      expect(started.open()).toContain(join(top, "new"));
    });

    expect(started.open()).toContain(join(top, "empty"));

    stop();
  });
});

test("stops watching a directory moved out of the worktree, and the directories in it", async () => {
  await inRepository(async (repository) => {
    await inDirectory(async (outside) => {
      writeFile(repository, "a/b/c", "c\n");

      const top = realpathSync(repository);
      const started = watchers();
      const { paths, stop } = await watching(repository, "linux", started.watchPath);

      await toldOf(paths, repository, "ready");
      renameSync(join(repository, "a"), join(outside, "a"));
      await vi.waitFor(() => {
        expect(started.open()).not.toContain(join(top, "a"));
      });

      expect(started.open()).not.toContain(join(top, "a", "b"));

      stop();
    });
  });
});

// git lists the files in `gone` first.
test.each<[string, (repository: string) => WatchPath]>([
  [
    "is deleted without git",
    (repository) => {
      rmSync(join(repository, "gone"), { recursive: true });

      return watchers().watchPath;
    },
  ],
  [
    "is made a file",
    (repository) => {
      rmSync(join(repository, "gone"), { recursive: true });
      writeFile(repository, "gone", "gone\n");

      return watchers().watchPath;
    },
  ],
  [
    "can't be read",
    (repository) =>
      refusing(watchers().watchPath, join(realpathSync(repository), "gone", "a")).watchPath,
  ],
])("watches the directories git lists files in, though one %s", async (_, change) => {
  await inRepository(async (repository) => {
    writeFile(repository, join("gone", "a", "b"), "b\n");
    writeFile(repository, join("there", "c"), "c\n");
    commitAll(repository);

    const { paths, failed, stop } = await watching(repository, "linux", change(repository));

    await toldOf(paths, repository, join("there", "c"));
    stop();

    expect(failed()).toBe(0);
  });
});

test("watches a directory git lists a file in once it's made again, after it was deleted without git", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, join("gone", "a"), "a\n");
    commitAll(repository);
    rmSync(join(repository, "gone"), { recursive: true });

    const { paths, failed, stop } = await watching(repository, "linux");

    await toldOf(paths, repository, "ready");
    await toldOf(paths, repository, join("gone", "a"));
    stop();

    expect(failed()).toBe(0);
  });
});

test("keeps watching where a directory that appears is gone before it's watched", async () => {
  await inRepository(async (repository) => {
    const brief = join(realpathSync(repository), "brief");

    const { paths, failed, stop } = await watching(
      repository,
      "linux",
      beforeWatching(watchers().watchPath, brief, () => {
        rmSync(brief, { recursive: true, force: true });
      }),
    );

    await toldOf(paths, repository, "ready");
    writeFile(repository, join("brief", "a"), "a\n");
    await toldOf(paths, repository, join("later", "a"));
    stop();

    expect(failed()).toBe(0);
  });
});

test("says it fails where it can't watch every directory git lists a file in, and stops watching what it started to", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a/b", "b\n");

    const started = watchers(2);
    const { failed, stop } = await watching(repository, "linux", started.watchPath);

    expect(failed()).toBe(1);

    stop();
    await setImmediate();

    expect(started.open()).toStrictEqual([]);
  });
});

test("says it fails once watching a directory fails", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a/b", "b\n");

    const started = watchers();
    const { failed, stop } = await watching(repository, "linux", started.watchPath);

    for (const watcher of started.started()) {
      watcher.emit("error", new Error("watching failed"));
    }

    stop();

    expect(failed()).toBe(started.started().length);
  });
});

// git reads a config the repository's includes, which nothing watches.
test("says it fails once git can't list what's in a directory that appeared", async () => {
  await inRepository(async (repository) => {
    await inDirectory(async (outside) => {
      writeFile(outside, "config", "");
      runGit(repository, ["config", "include.path", join(outside, "config")]);

      const { paths, failed, stop } = await watching(repository, "linux");

      await toldOf(paths, repository, "ready");
      writeFile(outside, "config", "[\n");
      mkdirSync(join(repository, "new"));
      await vi.waitFor(() => {
        expect(failed()).toBe(1);
      });
      stop();
    });
  });
});

test("starts watching nothing once stopped, though a directory appeared as it stopped", async () => {
  await inRepository(async (repository) => {
    const top = realpathSync(repository);
    const started = watchers();
    const { paths } = await watching(repository, "linux", started.watchPath, join(top, "new"));

    await toldOf(paths, repository, "ready");
    mkdirSync(join(repository, "new"));
    await vi.waitFor(() => {
      expect(paths).toContain(join(top, "new"));
    });
    await setTimeout(200);

    expect(started.open()).toStrictEqual([]);
  });
});

test(
  "watches the directories git lists files in, and those that appear, whatever their names hold",
  async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(filePath, filePath).filter((paths) => canCoexist(paths)),
        async ([listed, appearing]) => {
          await inRepository(async (repository) => {
            writeFile(repository, join(listed, "a"), "a\n");
            commitAll(repository);

            const { paths, failed, stop } = await watching(repository, "linux");

            await toldOf(paths, repository, join(listed, "a"));
            await toldOf(paths, repository, join(appearing, "a"));
            stop();

            expect(failed()).toBe(0);
          });
        },
      ),
      { numRuns: 15 },
    );
  },
  timeout,
);
