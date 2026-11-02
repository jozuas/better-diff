import { realpathSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { inRepository, runGit, writeFile } from "../test/repository";
import { hiding, watchers, watching } from "../test/watching";

// Fake timers say when the watch may list the index's files again. Its watchers and git run as
// they do, and the timers of `node:timers/promises` that the test waits on them with stay real.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
});

afterEach(() => {
  vi.useRealTimers();
});

async function until(isDone: () => boolean, waited = 0): Promise<void> {
  if (isDone()) {
    return;
  }

  if (waited >= 4000) {
    throw new Error("Not done after 4 seconds");
  }

  await setTimeout(10);
  await until(isDone, waited + 10);
}

// How many times the watch told of the path.
function timesToldOf(paths: readonly string[], path: string): number {
  return paths.filter((told) => told === path).length;
}

interface Ignored {
  // The paths of the directories watched.
  open: () => string[];
  // The path of the worktree's directory.
  ignored: (directory: string) => string;
  // Adds the directory's file to the index, and waits until the watch is told of the index.
  add: (directory: string) => Promise<void>;
  stop: () => void;
}

// Runs the test in a repository whose directories `ignored1`, `ignored2` and so on git ignores,
// each with the file `a`, watching it.
async function watchingIgnored(use: (watch: Ignored) => Promise<void>): Promise<void> {
  await inRepository(async (repository) => {
    writeFile(repository, ".gitignore", "ignored*/\n");

    for (const directory of ["ignored1", "ignored2", "ignored3"]) {
      writeFile(repository, join(directory, "a"), "a\n");
    }

    const top = realpathSync(repository);
    const index = join(top, ".git", "index");
    const started = watchers();
    const { paths, stop } = await watching(repository, "linux", started.watchPath);

    await use({
      open: started.open,
      ignored: (directory) => join(top, directory),
      add: async (directory) => {
        const before = `before-${directory}`;

        // macOS can leave a change untold as it starts to watch another directory, as it does
        // after a listing.
        await until(() => {
          writeFile(repository, before, "a\n");

          return paths.includes(join(top, before));
        });

        const told = timesToldOf(paths, index);

        runGit(repository, ["add", "--force", join(directory, "a")]);
        await until(() => timesToldOf(paths, index) > told);
        // As long as git would take to list the index's files.
        await setTimeout(200);
      },
      stop,
    });
  });
}

test("lists the index's files again a second at the soonest after it last did", async () => {
  await watchingIgnored(async ({ open, ignored, add, stop }) => {
    // Watches the directory once it may list the index's files again, a second on.
    async function listedASecondOn(directory: string): Promise<void> {
      await add(directory);

      expect(open()).not.toContain(ignored(directory));

      await vi.advanceTimersByTimeAsync(1000);
      await until(() => open().includes(ignored(directory)));
    }

    await add("ignored1");

    expect(open()).toContain(ignored("ignored1"));

    await listedASecondOn("ignored2");
    await listedASecondOn("ignored3");
    stop();
  });
});

test("leaves no timer behind once stopped while it waits to list the index's files again", async () => {
  await watchingIgnored(async ({ add, stop }) => {
    await add("ignored1");
    await add("ignored2");
    stop();

    expect(vi.getTimerCount()).toBe(0);
  });
});

// It stops as it starts to watch `new/inner`, as it lists in `new`, before it looks at the index.
test("sets no timer to list the index's files again once stopped while it looks at what changed", async () => {
  await inRepository(async (repository) => {
    const top = realpathSync(repository);
    const gitDirectory = join(top, ".git");
    const inner = join(top, "new", "inner");
    const hidden = hiding(watchers().watchPath);
    const { paths } = await watching(repository, "linux", hidden.watchPath, inner);

    hidden.tell(gitDirectory, "index");
    // As long as git would take to list the index's files.
    await setTimeout(200);
    writeFile(repository, join("new", "inner", "a"), "a\n");
    hidden.tell(top, "new");
    hidden.tell(gitDirectory, "index");
    await until(() => paths.includes(inner));
    await setTimeout(200);

    expect(vi.getTimerCount()).toBe(0);
  });
});
