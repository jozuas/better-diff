import { realpathSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

import { expect, test, vi } from "vitest";

import { inRepository, runGit, writeFile } from "../test/repository";
import { hiding, toldOf, watchers, watching } from "../test/watching";

const platforms: NodeJS.Platform[] = ["darwin", "linux"];

// It's stopped as it asks git whether it ignores `a`.
test.each(platforms)(
  "tells of nothing once stopped, though it was asking git about a change, on %s",
  async (platform) => {
    await inRepository(async (repository) => {
      const top = realpathSync(repository);
      const hidden = hiding(watchers().watchPath);
      const { paths, stop } = await watching(repository, platform, hidden.watchPath);

      hidden.tell(top, "a");
      stop();
      await setTimeout(200);

      expect(paths).not.toContain(join(top, "a"));
    });
  },
);

// It asks git about `after` once it has about the files before it.
test.each(platforms)(
  "tells of no change to a file git ignores, as one a build writes, on %s",
  async (platform) => {
    await inRepository(async (repository) => {
      writeFile(repository, ".gitignore", "*.log\ndist/\n");
      writeFile(repository, join("dist", "a"), "a\n");

      const top = realpathSync(repository);
      const { paths, stop } = await watching(repository, platform);

      await toldOf(paths, repository, "ready");
      writeFile(repository, "a.log", "a\n");
      writeFile(repository, join("dist", "a"), "b\n");
      await toldOf(paths, repository, "after");
      stop();

      expect(paths).not.toContain(join(top, "a.log"));
      expect(paths).not.toContain(join(top, "dist", "a"));
    });
  },
);

// A linked worktree's index is outside it.
test.each(
  platforms.flatMap((platform) => [
    [platform, "", ["index"]] as const,
    [platform, "linked", ["worktrees", "linked", "index"]] as const,
  ]),
)(
  "on %s, tells of a change to a file git ignores once it's in the index of the worktree %j",
  async (platform, worktree, index) => {
    await inRepository(async (repository) => {
      runGit(repository, ["worktree", "add", "--quiet", "--orphan", "linked"]);

      const directory = join(repository, worktree);

      writeFile(directory, ".gitignore", "*.log\n");

      const { paths, stop } = await watching(directory, platform);

      await toldOf(paths, directory, "ready");
      writeFile(directory, "a.log", "a\n");
      await toldOf(paths, directory, "before");
      runGit(directory, ["add", "--force", "a.log"]);
      await vi.waitFor(() => {
        expect(paths).toContain(join(realpathSync(repository), ".git", ...index));
      });
      await toldOf(paths, directory, "a.log");
      stop();
    });
  },
);

test.each(platforms)(
  "tells of a change to a file once a .gitignore no longer ignores it, on %s",
  async (platform) => {
    await inRepository(async (repository) => {
      writeFile(repository, ".gitignore", "*.log\n");

      const top = realpathSync(repository);
      const { paths, stop } = await watching(repository, platform);

      await toldOf(paths, repository, "ready");
      writeFile(repository, "a.log", "a\n");
      await toldOf(paths, repository, "before");
      writeFile(repository, ".gitignore", "");
      await vi.waitFor(() => {
        expect(paths).toContain(join(top, ".gitignore"));
      });
      await toldOf(paths, repository, "a.log");
      stop();
    });
  },
);
