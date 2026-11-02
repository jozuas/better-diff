import { realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setImmediate, setTimeout } from "node:timers/promises";

import { expect, test, vi } from "vitest";

import { commitAll, inDirectory, inRepository, runGit, writeFile } from "../test/repository";
import { refusing, toldOf, watchers, watching } from "../test/watching";

test("tells of a change to a file anywhere in the worktree", async () => {
  await inRepository(async (repository) => {
    const { paths, failed, stop } = await watching(repository, "darwin");

    await toldOf(paths, repository, join("a", "b", "c"));
    stop();

    expect(failed()).toBe(0);
  });
});

test("tells of a change to a linked worktree's index, which isn't in the worktree", async () => {
  await inRepository(async (repository) => {
    runGit(repository, ["worktree", "add", "--quiet", "--orphan", "linked"]);

    const linked = join(repository, "linked");
    const { paths, failed, stop } = await watching(linked, "darwin");

    await toldOf(paths, linked, "a");
    runGit(linked, ["add", "a"]);
    await vi.waitFor(() => {
      expect(paths).toContain(
        join(realpathSync(repository), ".git", "worktrees", "linked", "index"),
      );
    });
    stop();

    expect(failed()).toBe(0);
  });
});

// git status writes a cookie each time it asks git's file system monitor what changed, which would
// have each check call for another, and git status in a submodule does in its git directory. git
// writes objects and logs, and a linked worktree's index and branch, whenever it runs there, and a
// fetch writes the remotes' branches. Paths are from the repository's directory.
test.each([
  ["the index", "", ".git/index", true],
  ["HEAD", "", ".git/HEAD", true],
  ["the branch HEAD names", "", ".git/refs/heads/main", true],
  ["another branch", "", ".git/refs/heads/a", false],
  ["a remote's branch", "", ".git/refs/remotes/origin/a", false],
  ["the packed refs", "", ".git/packed-refs", true],
  ["a reftable", "", ".git/reftable/tables.list", true],
  ["the config", "", ".git/config", true],
  ["the worktree's config", "", ".git/config.worktree", true],
  ["the excludes", "", ".git/info/exclude", true],
  ["an object", "", ".git/objects/ab/cdef", false],
  ["a log", "", ".git/logs/HEAD", false],
  ["ORIG_HEAD", "", ".git/ORIG_HEAD", false],
  ["a linked worktree's index", "", ".git/worktrees/linked/index", false],
  ["a linked worktree's config", "", ".git/worktrees/linked/config.worktree", false],
  ["a cookie of git's file system monitor", "", ".git/fsmonitor--daemon/cookies/1-0", false],
  ["a submodule's index", "", ".git/modules/a/index", true],
  ["a submodule's HEAD", "", ".git/modules/a/HEAD", true],
  ["a submodule's branch", "", ".git/modules/a/refs/heads/a", true],
  ["a submodule's remote's branch", "", ".git/modules/a/refs/remotes/origin/a", false],
  ["a submodule's packed refs", "", ".git/modules/a/packed-refs", true],
  ["a submodule's reftable", "", ".git/modules/a/reftable/tables.list", true],
  ["a submodule's config", "", ".git/modules/a/config", true],
  ["a submodule's worktree's config", "", ".git/modules/a/config.worktree", true],
  ["a submodule's excludes", "", ".git/modules/a/info/exclude", true],
  ["another file in a submodule's info", "", ".git/modules/a/info/sparse-checkout", false],
  ["a file named for the excludes outside a submodule's info", "", ".git/modules/a/exclude", false],
  ["a submodule's object", "", ".git/modules/a/objects/ab/cdef", false],
  [
    "a cookie of a submodule's file system monitor",
    "",
    ".git/modules/a/fsmonitor--daemon/cookies/1-0",
    false,
  ],
  ["a file named for the branches outside a submodule's refs", "", ".git/modules/a/heads/a", false],
  ["the index of a submodule whose name has a slash", "", ".git/modules/a/b/index", true],
  ["the index of a submodule's submodule", "", ".git/modules/a/modules/b/index", true],
  ["the .git file of a repository in the worktree", "", "a/.git", true],
  ["the index of a repository in the worktree", "", "a/.git/index", true],
  [
    "a cookie of the file system monitor of a repository in the worktree",
    "",
    "a/.git/fsmonitor--daemon/cookies/1-0",
    false,
  ],
  ["its own index", "linked", ".git/worktrees/linked/index", true],
  ["its own HEAD", "linked", ".git/worktrees/linked/HEAD", true],
  ["its own reftable", "linked", ".git/worktrees/linked/reftable/tables.list", true],
  ["its own config", "linked", ".git/worktrees/linked/config.worktree", true],
  ["the branch its HEAD names", "linked", ".git/refs/heads/linked", true],
  ["the main worktree's branch", "linked", ".git/refs/heads/main", false],
  ["the main worktree's index", "linked", ".git/index", false],
  ["the main worktree's HEAD", "linked", ".git/HEAD", false],
])(
  "tells of a change to %s, from the worktree %j, only where git status reads it",
  async (_, worktree, path, told) => {
    await inRepository(async (repository) => {
      runGit(repository, ["symbolic-ref", "HEAD", "refs/heads/main"]);
      runGit(repository, ["worktree", "add", "--quiet", "--orphan", "linked"]);

      const directory = join(repository, worktree);
      const file = join(realpathSync(repository), path);
      const { paths, stop } = await watching(directory, "darwin");

      await toldOf(paths, directory, "before");
      writeFile(repository, path, "a\n");
      await toldOf(paths, directory, "after");
      await vi.waitFor(() => {
        expect(paths.includes(file)).toBe(told);
      });
      stop();
    });
  },
);

// The branch's ref is a file of its own, as a commit leaves it. The index stays as it was.
test.each<NodeJS.Platform>(["darwin", "linux"])(
  "tells of a change to the branch HEAD names, though nothing else changes, as with a soft reset, on %s",
  async (platform) => {
    await inRepository(async (repository) => {
      runGit(repository, ["symbolic-ref", "HEAD", "refs/heads/main"]);
      writeFile(repository, "a", "a\n");
      commitAll(repository);
      writeFile(repository, "a", "b\n");
      commitAll(repository);

      const branch = join(realpathSync(repository), ".git", "refs", "heads", "main");
      const { paths, stop } = await watching(repository, platform);

      await toldOf(paths, repository, "ready");
      runGit(repository, ["reset", "--soft", "HEAD~1"]);
      await vi.waitFor(() => {
        expect(paths).toContain(branch);
      });
      stop();
    });
  },
);

test.each<NodeJS.Platform>(["darwin", "linux"])(
  "tells of a change to the branch HEAD names, once HEAD names another, in a directory that appeared, on %s",
  async (platform) => {
    await inRepository(async (repository) => {
      writeFile(repository, "a", "a\n");
      commitAll(repository);

      const branch = join(realpathSync(repository), ".git", "refs", "heads", "a", "b");
      const { paths, stop } = await watching(repository, platform);

      await toldOf(paths, repository, "ready");
      runGit(repository, ["switch", "--quiet", "--create", "a/b"]);
      await toldOf(paths, repository, "switched");
      paths.splice(0);
      runGit(repository, ["commit", "--quiet", "--allow-empty", "--message", "Empty"]);
      await vi.waitFor(() => {
        expect(paths).toContain(branch);
      });
      stop();
    });
  },
);

test.each<NodeJS.Platform>(["darwin", "linux"])(
  "tells of a change to the refs where a reftable holds them, on %s",
  async (platform) => {
    await inDirectory(async (repository) => {
      runGit(repository, ["init", "--quiet", "--ref-format=reftable"]);
      writeFile(repository, "a", "a\n");
      commitAll(repository);
      writeFile(repository, "a", "b\n");
      commitAll(repository);

      const reftable = join(realpathSync(repository), ".git", "reftable");
      const { paths, stop } = await watching(repository, platform);

      await toldOf(paths, repository, "ready");
      runGit(repository, ["reset", "--soft", "HEAD~1"]);
      await vi.waitFor(() => {
        expect(paths.some((path) => path.startsWith(reftable))).toBe(true);
      });
      stop();
    });
  },
);

test.each<[NodeJS.Platform, string, string[]]>([
  ["darwin", "", [""]],
  ["darwin", "linked", ["linked", ".git"]],
  ["win32", "", [""]],
])(
  "on %s, watches the worktree %j, and each git directory outside it, once, with everything in it",
  async (platform, worktree, trees) => {
    await inRepository(async (repository) => {
      runGit(repository, ["worktree", "add", "--quiet", "--orphan", "linked"]);

      const started = watchers();
      const { stop } = await watching(join(repository, worktree), platform, started.watchPath);

      expect(started.open()).toStrictEqual(
        trees.map((tree) => join(realpathSync(repository), tree)),
      );
      expect(started.recursive()).not.toContain(false);

      stop();
    });
  },
);

test("tells of nothing once stopped", async () => {
  await inRepository(async (repository) => {
    const stopped = await watching(repository, "darwin");
    const control = await watching(repository, "darwin");

    await toldOf(stopped.paths, repository, "a");
    stopped.stop();
    await toldOf(control.paths, repository, "b");
    control.stop();
    await setTimeout(100);

    expect(stopped.paths).not.toContain(join(realpathSync(repository), "b"));
  });
});

test("watches on Windows as on macOS", async () => {
  await inRepository(async (repository) => {
    const { paths, failed, stop } = await watching(repository, "win32");

    await toldOf(paths, repository, join("a", "b"));
    stop();

    expect(failed()).toBe(0);
  });
});

test.each<NodeJS.Platform>(["darwin", "linux"])(
  "says it fails outside a repository, on %s",
  async (platform) => {
    await inDirectory(async (directory) => {
      const { failed, stop } = await watching(directory, platform);

      stop();

      expect(failed()).toBe(1);
    });
  },
);

test("says it fails where it can't start watching, and stops watching what it started to", async () => {
  await inRepository(async (repository) => {
    runGit(repository, ["worktree", "add", "--quiet", "--orphan", "linked"]);

    const started = watchers(1);

    const { failed, stop } = await watching(
      join(repository, "linked"),
      "darwin",
      started.watchPath,
    );

    expect(failed()).toBe(1);

    stop();
    await setImmediate();

    expect(started.open()).toStrictEqual([]);
  });
});

test("says it fails where it can't watch a git directory, as one it can't read", async () => {
  await inRepository(async (repository) => {
    runGit(repository, ["worktree", "add", "--quiet", "--orphan", "linked"]);

    const started = watchers();
    const refused = refusing(started.watchPath, join(realpathSync(repository), ".git"));

    const { failed, stop } = await watching(
      join(repository, "linked"),
      "darwin",
      refused.watchPath,
    );

    expect(failed()).toBe(1);

    stop();
    await setImmediate();

    expect(started.open()).toStrictEqual([]);
  });
});

// It reads HEAD to see whether git status reads a ref that changes, and only then: not as git writes
// ORIG_HEAD, or an object. macOS can tell of what changed just before it watched, as the refs did
// as the repository was made, so HEAD goes once it has told of a change after.
test("says it fails where it can't read HEAD, as once it's gone, once a ref changes", async () => {
  await inRepository(async (repository) => {
    const { paths, failed, stop } = await watching(repository, "darwin");

    await toldOf(paths, repository, "before");
    rmSync(join(repository, ".git", "HEAD"));
    writeFile(repository, join(".git", "ORIG_HEAD"), "a\n");
    await toldOf(paths, repository, "ready");

    expect(failed()).toBe(0);

    await vi.waitFor(() => {
      writeFile(repository, join(".git", "refs", "heads", "a"), "a\n");

      expect(failed()).toBeGreaterThan(0);
    });
    stop();
  });
});

test("says it fails once watching fails", async () => {
  await inRepository(async (repository) => {
    runGit(repository, ["worktree", "add", "--quiet", "--orphan", "linked"]);

    const started = watchers();

    const { failed, stop } = await watching(
      join(repository, "linked"),
      "darwin",
      started.watchPath,
    );

    for (const watcher of started.started()) {
      watcher.emit("error", new Error("watching failed"));
    }

    stop();

    expect(failed()).toBe(2);
  });
});
