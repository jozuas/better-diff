import { realpathSync, renameSync } from "node:fs";
import type { FSWatcher } from "node:fs";
import { join, sep } from "node:path";
import { setImmediate } from "node:timers/promises";

import { expect, test, vi } from "vitest";

import { commitAll, inDirectory, inRepository, runGit, writeFile } from "../test/repository";
import { refusing, toldOf, watchers, watching } from "../test/watching";

test("tells of a change to the excludes, though their directory appeared once it watched, and watches a directory they no longer ignore", async () => {
  await inRepository(async (repository) => {
    await inDirectory(async (outside) => {
      writeFile(outside, "ignore", "ignored/\n");
      runGit(repository, ["config", "core.excludesFile", join(outside, "ignore")]);
      writeFile(repository, join("ignored", "a"), "a\n");

      const top = realpathSync(repository);
      const { paths, failed, stop } = await watching(repository, "linux");

      await toldOf(paths, repository, "ready");
      writeFile(outside, join("info", "exclude"), "!ignored/\n");
      renameSync(join(outside, "info"), join(repository, ".git", "info"));
      await vi.waitFor(() => {
        expect(paths).toContain(join(top, ".git", "info", "exclude"));
      });
      await toldOf(paths, repository, join("ignored", "a"));
      stop();

      expect(failed()).toBe(0);
    });
  });
});

test("keeps watching where HEAD names a commit, as once detached", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    commitAll(repository);
    runGit(repository, ["switch", "--quiet", "--detach"]);

    const { paths, failed, stop } = await watching(repository, "linux");

    await toldOf(paths, repository, "before");
    runGit(repository, ["commit", "--quiet", "--allow-empty", "--message", "Empty"]);
    await toldOf(paths, repository, "after");
    stop();

    expect(failed()).toBe(0);
    expect(paths).not.toContain(join(realpathSync(repository), ".git", "info", "exclude"));
  });
});

// macOS can leave a change untold as it starts or stops watching a directory, so each step waits
// until the watch tells of a file it writes.
test("watches the directories on the way to the branch HEAD names, anew where one went and came back, and no longer once HEAD names another", async () => {
  await inRepository(async (repository) => {
    runGit(repository, ["symbolic-ref", "HEAD", "refs/heads/main"]);
    writeFile(repository, "a", "a\n");
    commitAll(repository);

    const branches = join(realpathSync(repository), ".git", "refs", "heads");
    const a = join(branches, "a");
    const started = watchers();
    const { paths, stop } = await watching(repository, "linux", started.watchPath);

    // Runs git, and waits until the watch is told of the file after the one with `openAt(a)` saying it's done.
    async function step(
      args: readonly string[],
      done: (open: FSWatcher[]) => void,
      name: string,
    ): Promise<void> {
      runGit(repository, args);
      await vi.waitFor(
        () => {
          done(started.openAt(a));
        },
        { timeout: 4000 },
      );
      await toldOf(paths, repository, name);
    }

    await toldOf(paths, repository, "ready");
    await step(
      ["switch", "--quiet", "--create", "a/b"],
      (open) => {
        expect(open).toHaveLength(1);
      },
      "switched",
    );

    const [before] = started.openAt(a);

    // It deletes `refs/heads/a`, which holds no loose ref then.
    runGit(repository, ["pack-refs", "--all"]);
    await toldOf(paths, repository, "packed");
    await step(
      ["commit", "--quiet", "--allow-empty", "--message", "Empty"],
      (open) => {
        expect(open).toHaveLength(1);
        expect(open).not.toContain(before);
      },
      "committed",
    );
    await step(
      ["switch", "--quiet", "main"],
      (open) => {
        expect(open).toStrictEqual([]);
      },
      "back",
    );
    await step(
      ["switch", "--quiet", "a/b"],
      (open) => {
        expect(open).toHaveLength(1);
      },
      "again",
    );
    stop();
    await setImmediate();

    expect(started.openAt(branches)).toStrictEqual([]);
  });
});

test("watches the git directories without what's in them, and each once", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    commitAll(repository);

    const branches = join(realpathSync(repository), ".git", "refs", "heads");
    const started = watchers();
    const { paths, stop } = await watching(repository, "linux", started.watchPath);

    await toldOf(paths, repository, "ready");
    runGit(repository, ["commit", "--quiet", "--allow-empty", "--message", "Empty"]);
    await toldOf(paths, repository, "after");

    expect(started.openAt(branches)).toHaveLength(1);

    stop();

    expect(started.recursive()).not.toContain(true);
  });
});

test("says it fails where it can't watch a directory it comes to watch in the git directories", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    commitAll(repository);

    const a = join(realpathSync(repository), ".git", "refs", "heads", "a");
    const refused = refusing(watchers().watchPath, a, "ENOSPC");
    const { paths, failed, stop } = await watching(repository, "linux", refused.watchPath);

    await toldOf(paths, repository, "ready");
    runGit(repository, ["switch", "--quiet", "--create", "a/b"]);
    await vi.waitFor(() => {
      expect(failed()).toBeGreaterThan(0);
    });
    stop();
  });
});

// A worktree's own reftable holds its HEAD.
test.each<[string, string[], string[]]>([
  ["a branch made, in the reftable the worktrees share", ["branch", "other"], ["reftable"]],
  [
    "HEAD detached, in the worktree's own reftable",
    ["switch", "--quiet", "--detach"],
    ["worktrees", "linked", "reftable"],
  ],
])("tells of %s", async (_, args, reftable) => {
  await inDirectory(async (repository) => {
    runGit(repository, ["init", "--quiet", "--ref-format=reftable"]);
    runGit(repository, ["commit", "--quiet", "--allow-empty", "--message", "Empty"]);
    runGit(repository, ["worktree", "add", "--quiet", "linked"]);

    const linked = join(repository, "linked");
    const tables = join(realpathSync(repository), ".git", ...reftable);
    const { paths, stop } = await watching(linked, "linux");

    await toldOf(paths, linked, "ready");
    runGit(linked, args);
    await vi.waitFor(() => {
      expect(paths.some((path) => path.startsWith(`${tables}${sep}`))).toBe(true);
    });
    stop();
  });
});
