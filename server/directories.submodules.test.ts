import { realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";

import { expect, test, vi } from "vitest";

import { commitAll, inRepository, runGit, writeFile } from "../test/repository";
import { toldOf, watchers, watching } from "../test/watching";

// git clones a submodule from a repository on the same machine only where told it may.
function submodule(repository: string, args: readonly string[]): void {
  runGit(repository, ["-c", "protocol.file.allow=always", "submodule", ...args]);
}

// Runs the test in a repository with the submodule `sub`, which has the file `d/s`.
async function withSubmodule(use: (repository: string) => Promise<void>): Promise<void> {
  await inRepository(async (source) => {
    writeFile(source, join("d", "s"), "s\n");
    commitAll(source);

    await inRepository(async (repository) => {
      submodule(repository, ["add", "--quiet", source, "sub"]);
      commitAll(repository);
      await use(repository);
    });
  });
}

test.each<NodeJS.Platform>(["darwin", "linux"])(
  "tells of a change in a submodule, in a directory that appears there after one appears elsewhere, and to its index, and of nothing once stopped, on %s",
  async (platform) => {
    await withSubmodule(async (repository) => {
      const started = watchers();
      const { paths, failed, stop } = await watching(repository, platform, started.watchPath);

      await toldOf(paths, repository, join("sub", "d", "s"));
      await toldOf(paths, repository, join("elsewhere", "a"));
      await toldOf(paths, repository, join("sub", "new", "a"));
      runGit(join(repository, "sub"), ["add", join("new", "a")]);
      await vi.waitFor(() => {
        expect(paths).toContain(join(realpathSync(repository), ".git", "modules", "sub", "index"));
      });
      stop();
      await setImmediate();

      expect(failed()).toBe(0);
      expect(started.open()).toStrictEqual([]);
    });
  },
);

// It's initialised before, as that writes the config, after which the whole worktree is listed
// again: only its `.git` appearing in its directory tells of it being checked out.
test("watches a submodule once it's checked out, telling of its directory, which it watches once", async () => {
  await withSubmodule(async (repository) => {
    submodule(repository, ["deinit", "--quiet", "--force", "sub"]);
    submodule(repository, ["init", "--quiet"]);

    const sub = join(realpathSync(repository), "sub");
    const started = watchers();
    const { paths, failed, stop } = await watching(repository, "linux", started.watchPath);

    await toldOf(paths, repository, "ready");
    submodule(repository, ["update", "--quiet"]);
    await toldOf(paths, repository, join("sub", "d", "s"));

    expect(started.openAt(sub)).toHaveLength(1);

    stop();

    expect(failed()).toBe(0);
    expect(paths).toContain(sub);
  });
});

test("watches a submodule whose directory is gone once it's checked out again", async () => {
  await withSubmodule(async (repository) => {
    submodule(repository, ["deinit", "--quiet", "--force", "sub"]);
    rmSync(join(repository, "sub"), { recursive: true });

    const { paths, failed, stop } = await watching(repository, "linux");

    await toldOf(paths, repository, "ready");
    submodule(repository, ["update", "--quiet", "--init"]);
    await toldOf(paths, repository, join("sub", "d", "s"));
    stop();

    expect(failed()).toBe(0);
  });
});

test("watches a submodule anew once its directory is checked out again", async () => {
  await withSubmodule(async (repository) => {
    const sub = join(realpathSync(repository), "sub");
    const started = watchers();
    const { paths, failed, stop } = await watching(repository, "linux", started.watchPath);

    await toldOf(paths, repository, join("sub", "d", "s"));

    const [before] = started.openAt(sub);

    rmSync(join(repository, "sub"), { recursive: true });
    await toldOf(paths, repository, "removed");
    submodule(repository, ["update", "--quiet"]);
    paths.splice(0);
    await toldOf(paths, repository, join("sub", "d", "s"));

    const after = started.openAt(sub);

    stop();

    expect(failed()).toBe(0);
    expect(after).toHaveLength(1);
    expect(after).not.toContain(before);
  });
});
