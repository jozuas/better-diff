import { realpathSync, rmSync, utimesSync } from "node:fs";
import { join } from "node:path";

import { expect, test, vi } from "vitest";

import { inDirectory, inRepository, runGit, writeFile } from "../test/repository";
import { hiding, toldOf, watchers, watching } from "../test/watching";

test.each<NodeJS.Platform>(["darwin", "linux"])(
  "tells of a change in a worktree of a bare repository, which its git directory holds, on %s",
  async (platform) => {
    await inDirectory(async (bare) => {
      runGit(bare, ["init", "--quiet", "--bare"]);
      runGit(bare, ["worktree", "add", "--quiet", "--orphan", "main"]);

      const main = join(bare, "main");
      const { paths, failed, stop } = await watching(main, platform);

      await toldOf(paths, main, "ready");
      await toldOf(paths, main, join("a", "b"));
      await vi.waitFor(() => {
        utimesSync(main, new Date(), new Date());

        expect(paths).toContain(realpathSync(main));
      });
      stop();

      expect(failed()).toBe(0);
    });
  },
);

// git status lists another worktree in the worktree as a repository of its own, by its directory,
// which changes as what's in it at once does.
test.each<NodeJS.Platform>(["darwin", "linux"])(
  "tells of a change in another of the repository's worktrees in the worktree only where it's at once in it, on %s",
  async (platform) => {
    await inRepository(async (repository) => {
      runGit(repository, ["worktree", "add", "--quiet", "--orphan", "linked"]);

      const linked = join(realpathSync(repository), "linked");
      const { paths, stop } = await watching(repository, platform);

      await toldOf(paths, repository, "before");
      writeFile(repository, join("linked", "a", "b"), "b\n");
      writeFile(repository, join("linked", "d", ".git", "index"), "index\n");
      await toldOf(paths, repository, join("linked", "c"));
      await toldOf(paths, repository, "after");
      stop();

      expect(paths).not.toContain(join(linked, "a", "b"));
      expect(paths).not.toContain(join(linked, "d", ".git", "index"));
    });
  },
);

test("tells of no change deep in another of the repository's worktrees in the worktree, though the record of another is all that's left of it", async () => {
  await inRepository(async (repository) => {
    runGit(repository, ["worktree", "add", "--quiet", "--orphan", "gone"]);
    runGit(repository, ["worktree", "add", "--quiet", "--orphan", "linked"]);
    rmSync(join(repository, "gone"), { recursive: true });

    const linked = join(realpathSync(repository), "linked");
    const { paths, stop } = await watching(repository, "darwin");

    await toldOf(paths, repository, "before");
    writeFile(repository, join("linked", "a", "b"), "b\n");
    await toldOf(paths, repository, "after");
    stop();

    expect(paths).not.toContain(join(linked, "a", "b"));
  });
});

test("tells of a change deep in another of the repository's worktrees in the worktree no more once it's added", async () => {
  await inRepository(async (repository) => {
    const linked = join(realpathSync(repository), "linked");
    const { paths, stop } = await watching(repository, "darwin");

    await toldOf(paths, repository, "ready");
    runGit(repository, ["worktree", "add", "--quiet", "--orphan", "linked"]);
    await toldOf(paths, repository, "before");
    writeFile(repository, join("linked", "a", "b"), "b\n");
    await toldOf(paths, repository, "after");
    stop();

    expect(paths).not.toContain(join(linked, "a", "b"));
  });
});

// On Linux it watches the directory anew, as it would one that went and came back, and tells of
// the index in it.
test.each<[NodeJS.Platform, string, string[]]>([
  ["darwin", ".git", []],
  ["linux", join(".git", "worktrees", "linked"), ["index"]],
])(
  "on %s, tells of a change to the git directory %j where the platform doesn't say what in it changed",
  async (platform, directory, files) => {
    await inRepository(async (repository) => {
      runGit(repository, ["worktree", "add", "--quiet", "--orphan", "linked"]);

      const gitDirectory = join(realpathSync(repository), directory);
      const hidden = hiding(watchers().watchPath);

      const { paths, stop } = await watching(
        join(repository, "linked"),
        platform,
        hidden.watchPath,
      );

      hidden.tell(gitDirectory, null, "change");
      stop();

      expect(paths).toStrictEqual(
        expect.arrayContaining([gitDirectory, ...files.map((file) => join(gitDirectory, file))]),
      );
    });
  },
);
