import { mkdirSync, realpathSync, utimesSync } from "node:fs";
import type { WatchEventType } from "node:fs";
import { join } from "node:path";

import { expect, test, vi } from "vitest";

import {
  commitAll,
  inDirectory,
  inRepository,
  runGit,
  timeout,
  writeFile,
} from "../test/repository";
import { beforeWatching, hiding, refusing, toldOf, watchers, watching } from "../test/watching";

// More bytes of directories' paths than a process can start with as arguments, as in
// diff.many-files.test.ts: about 1.9 MB on macOS, which allows 1 MiB, and 6.9 MB on Linux, which
// allows at most 6 MiB. Each path is shorter than the longest path the system allows.
const { count, depth } =
  process.platform === "darwin" ? { count: 3000, depth: 3 } : { count: 2000, depth: 17 };

test("watches a directory that appears in another after git lists it, but before it's watched", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, join("a", "b"), "b\n");

    const a = join(realpathSync(repository), "a");
    const hidden = hiding(watchers().watchPath, [join(a, "new")]);

    const { paths, stop } = await watching(
      repository,
      "linux",
      beforeWatching(hidden.watchPath, a, () => {
        writeFile(a, join("new", "c"), "c\n");
      }),
    );

    await toldOf(paths, repository, join("a", "new", "c"));
    stop();

    expect(paths).toContain(join(a, "new"));
  });
});

// Each directory but the one where one appears last changed an hour ago, so that it alone could
// have changed since git listed what's in it. macOS can tell of what changed just before a
// directory was watched, which Linux doesn't, so what changes there is hidden.
async function watchingAfterAppearing(
  repository: string,
  changedAt: (now: number) => number,
): Promise<{ paths: string[]; open: () => string[]; stop: () => void }> {
  writeFile(repository, join("a", "b"), "b\n");

  const top = realpathSync(repository);
  const a = join(top, "a");
  const anHourAgo = new Date(Date.now() - 3_600_000);

  for (const directory of [top, a]) {
    utimesSync(directory, anHourAgo, anHourAgo);
  }

  const started = watchers();
  const hidden = hiding(started.watchPath, [a, join(a, "new")]);

  const { paths, stop } = await watching(
    repository,
    "linux",
    beforeWatching(hidden.watchPath, a, () => {
      writeFile(a, join("new", "c"), "c\n");

      const at = new Date(changedAt(Date.now()));

      utimesSync(a, at, at);
    }),
  );

  return { paths, open: started.open, stop };
}

test("lists again in a directory that changed after git listed what's in it, though its modification time lags, as on a file system that keeps whole seconds", async () => {
  await inRepository(async (repository) => {
    const { paths, open, stop } = await watchingAfterAppearing(repository, (now) => now - 1000);

    await toldOf(paths, repository, join("a", "new", "c"));
    stop();

    expect(paths).toContain(join(realpathSync(repository), "a", "new"));
    expect(open()).toContain(join(realpathSync(repository), "a", "new"));
  });
});

// Listing the whole worktree again, as it would without looking, takes as long as listing it did.
test("doesn't list again in a directory whose modification time says it didn't change since git listed what's in it", async () => {
  await inRepository(async (repository) => {
    const { paths, open, stop } = await watchingAfterAppearing(
      repository,
      (now) => now - 3_600_000,
    );

    await toldOf(paths, repository, "ready");
    await toldOf(paths, repository, join("later", "a"));
    stop();

    expect(open()).not.toContain(join(realpathSync(repository), "a", "new"));
  });
});

test.each(["", "sub"])(
  "watches a directory once the .gitignore in %j no longer ignores it",
  async (directory) => {
    await inRepository(async (repository) => {
      writeFile(repository, join(directory, ".gitignore"), "ignored/\n");
      writeFile(repository, join(directory, "ignored", "a"), "a\n");

      const { paths, failed, stop } = await watching(repository, "linux");

      await toldOf(paths, repository, "ready");
      writeFile(repository, join(directory, ".gitignore"), "");
      await toldOf(paths, repository, join(directory, "ignored", "a"));
      stop();

      expect(paths).toContain(join(realpathSync(repository), directory, "ignored"));
      expect(failed()).toBe(0);
    });
  },
);

test("watches a directory once the excludes no longer ignore it", async () => {
  await inRepository(async (repository) => {
    const excludes = join(".git", "info", "exclude");

    writeFile(repository, excludes, "ignored/\n");
    writeFile(repository, join("ignored", "a"), "a\n");

    const { paths, stop } = await watching(repository, "linux");

    await toldOf(paths, repository, "ready");
    writeFile(repository, excludes, "");
    await toldOf(paths, repository, join("ignored", "a"));
    stop();

    expect(paths).toContain(join(realpathSync(repository), excludes));
    expect(paths).toContain(join(realpathSync(repository), "ignored"));
  });
});

// It's told of the excludes and of `b` at once, so that it looks at what changed at both at once.
test("watches a directory once the excludes no longer ignore it, though a file changed with them", async () => {
  await inRepository(async (repository) => {
    const top = realpathSync(repository);
    const info = join(top, ".git", "info");

    writeFile(repository, join(".git", "info", "exclude"), "ignored/\n");
    writeFile(repository, join("ignored", "a"), "a\n");

    const hidden = hiding(watchers().watchPath, [join(info, "exclude")]);
    const { paths, stop } = await watching(repository, "linux", hidden.watchPath);

    await toldOf(paths, repository, "ready");
    writeFile(repository, join(".git", "info", "exclude"), "");
    writeFile(repository, "b", "b\n");
    hidden.tell(info, "exclude");
    hidden.tell(top, "b");
    await toldOf(paths, repository, join("ignored", "a"));
    stop();

    expect(paths).toContain(join(top, "ignored"));
  });
});

// The config names an excludes file outside the repository, as git reads it, until it no longer
// does.
test.each([
  ["config", []],
  ["config.worktree", ["--worktree"]],
])(
  "watches a directory once the %s no longer names an excludes file that ignores it",
  async (_, config) => {
    await inRepository(async (repository) => {
      await inDirectory(async (outside) => {
        writeFile(outside, "exclude", "ignored/\n");
        runGit(repository, ["config", "extensions.worktreeConfig", "true"]);
        runGit(repository, ["config", ...config, "core.excludesFile", join(outside, "exclude")]);
        writeFile(repository, join("ignored", "a"), "a\n");

        const { paths, stop } = await watching(repository, "linux");

        await toldOf(paths, repository, "ready");
        runGit(repository, ["config", ...config, "--unset", "core.excludesFile"]);
        await toldOf(paths, repository, join("ignored", "a"));
        stop();

        expect(paths).toContain(join(realpathSync(repository), "ignored"));
      });
    });
  },
);

test("watches a directory once git adds a file in it to the index", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, ".gitignore", "ignored/\n");
    writeFile(repository, join("ignored", "a"), "a\n");

    const { paths, failed, stop } = await watching(repository, "linux");

    await toldOf(paths, repository, "ready");
    runGit(repository, ["add", "--force", join("ignored", "a")]);
    await toldOf(paths, repository, join("ignored", "a"));
    stop();

    expect(paths).toContain(join(realpathSync(repository), "ignored"));
    expect(failed()).toBe(0);
  });
});

// It lists in a directory it couldn't watch only where that directory is in what it lists. Linux
// says the attributes of one changed once it's made readable.
test.each<WatchEventType>(["rename", "change"])(
  "lists again only in the directories that change, and watches one it couldn't once told of it, by a %j",
  async (event) => {
    await inRepository(async (repository) => {
      writeFile(repository, join("x", "a"), "a\n");
      commitAll(repository);

      const top = realpathSync(repository);
      const x = join(top, "x");
      const started = watchers();
      const refused = refusing(started.watchPath, x);
      const hidden = hiding(refused.watchPath);
      const { paths, stop } = await watching(repository, "linux", hidden.watchPath);

      refused.allow();
      await toldOf(paths, repository, "ready");
      await toldOf(paths, repository, join("y", "a"));
      await toldOf(paths, repository, join("z", "a"));

      expect(started.open()).not.toContain(x);

      hidden.tell(top, "x", event);
      await vi.waitFor(() => {
        expect(started.open()).toContain(x);
      });
      stop();
    });
  },
);

test("lists nothing again where only files change, however many at once", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, join("x", "a"), "a\n");
    commitAll(repository);

    const top = realpathSync(repository);
    const x = join(top, "x");
    const started = watchers();
    const refused = refusing(started.watchPath, x);
    const hidden = hiding(refused.watchPath);
    const { paths, stop } = await watching(repository, "linux", hidden.watchPath);
    const files = Array.from({ length: 30 }, (_, index) => `${index}`);

    refused.allow();
    await toldOf(paths, repository, "ready");

    for (const file of files) {
      writeFile(repository, file, "a\n");
      hidden.tell(top, file);
    }

    await toldOf(paths, repository, join("z", "a"));

    expect(started.open()).not.toContain(x);

    stop();
  });
});

test("lists only the index's files again once the index changes", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, join("untracked", "a"), "a\n");

    const untracked = join(realpathSync(repository), "untracked");
    const started = watchers();
    const refused = refusing(started.watchPath, untracked);
    const { paths, stop } = await watching(repository, "linux", refused.watchPath);

    refused.allow();
    await toldOf(paths, repository, "ready");
    writeFile(repository, "b", "b\n");
    runGit(repository, ["add", "b"]);
    await toldOf(paths, repository, join("z", "a"));

    expect(started.open()).not.toContain(untracked);

    stop();
  });
});

test(
  "lists the whole worktree where more directories change at once than git could be given",
  async () => {
    await inRepository(async (repository) => {
      writeFile(repository, ".gitignore", "ignored/\n");

      const top = realpathSync(repository);
      const hidden = hiding(watchers().watchPath, [join(top, "new")]);

      const { paths, failed, stop } = await watching(repository, "linux", hidden.watchPath);
      const deep = join("ignored", ...Array.from({ length: depth }, () => "a".repeat(200)));

      const changed = [
        ...Array.from({ length: count }, (_, index) => join(deep, `${index}`)),
        "new",
      ];

      for (const directory of changed) {
        mkdirSync(join(repository, directory), { recursive: true });
      }

      writeFile(repository, join("new", "a"), "a\n");

      for (const directory of changed) {
        hidden.tell(top, directory);
      }

      await toldOf(paths, repository, join("new", "a"));
      stop();

      expect(failed()).toBe(0);
    });
  },
  timeout,
);

test("lists nothing again for a directory that appears in a git directory", async () => {
  await inRepository(async (repository) => {
    runGit(repository, ["worktree", "add", "--quiet", "--orphan", "linked"]);

    const linked = join(repository, "linked");
    const { paths, failed, stop } = await watching(linked, "linux");

    await toldOf(paths, linked, "ready");
    mkdirSync(join(repository, ".git", "new"));
    mkdirSync(join(repository, ".git", "worktrees", "linked", "new"));
    await toldOf(paths, linked, join("later", "a"));
    stop();

    expect(failed()).toBe(0);
  });
});
