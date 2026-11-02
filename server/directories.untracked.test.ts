import { chmodSync, mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { inRepository, makeUnreadable, runGit, writeFile } from "../test/repository";
import { toldOf, watchers, watching } from "../test/watching";

// git lists the untracked directory `new` by its own path alone, and the files in it, but none in
// the directory given, which holds none it doesn't ignore.
test.each([
  ["an empty directory", join("new", "empty"), []],
  ["an empty directory beside a file git lists", join("new", "sub", "empty"), ["new/sub/a"]],
  ["a directory that holds only files git ignores", join("new", "logs"), ["new/logs/a.log"]],
])(
  "watches %s in an untracked directory, and tells of a file that appears in it",
  async (_, directory, files) => {
    await inRepository(async (repository) => {
      writeFile(repository, ".gitignore", "*.log\n");
      mkdirSync(join(repository, directory), { recursive: true });

      for (const file of files) {
        writeFile(repository, file, "a\n");
      }

      const started = watchers();
      const { paths, failed, stop } = await watching(repository, "linux", started.watchPath);

      expect(started.open()).toContain(join(realpathSync(repository), directory));

      await toldOf(paths, repository, join(directory, "a"));
      stop();

      expect(failed()).toBe(0);
    });
  },
);

test("watches each directory `mkdir -p` makes in the worktree as it watches it, and tells of a file that appears in the deepest", async () => {
  await inRepository(async (repository) => {
    const { paths, stop } = await watching(repository, "linux");

    await toldOf(paths, repository, "ready");
    mkdirSync(join(repository, "new", "a", "b"), { recursive: true });
    await toldOf(paths, repository, join("new", "a", "b", "c"));
    stop();

    expect(paths).toContain(join(realpathSync(repository), "new", "a", "b"));
  });
});

// Nor does it look in them: `ignored` holds a directory of its own, and `repository` one that isn't
// its git directory. Nor does it watch a file as a directory.
test("doesn't watch a directory git ignores in an untracked directory, a repository of its own's directories, or a file", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, ".gitignore", "ignored/\n");
    mkdirSync(join(repository, "new", "empty"), { recursive: true });
    mkdirSync(join(repository, "new", "ignored", "deep"), { recursive: true });
    mkdirSync(join(repository, "new", "repository", "deep"), { recursive: true });
    runGit(join(repository, "new", "repository"), ["init", "--quiet"]);
    writeFile(repository, join("new", "file"), "a\n");

    const top = realpathSync(repository);
    const started = watchers();
    const { stop } = await watching(repository, "linux", started.watchPath);
    const open = started.open();

    stop();

    expect(open).toContain(join(top, "new", "empty"));
    expect(open).toContain(join(top, "new", "repository"));

    for (const path of [
      join("new", "ignored"),
      join("new", "ignored", "deep"),
      join("new", "repository", "deep"),
      join("new", "repository", ".git"),
      join("new", "file"),
    ]) {
      expect(open).not.toContain(join(top, path));
    }
  });
});

// git lists a directory it can't read.
test("watches the worktree though it can't look in an untracked directory", async () => {
  await inRepository(async (repository) => {
    mkdirSync(join(repository, "locked"));
    makeUnreadable(repository, "locked");

    try {
      const { paths, failed, stop } = await watching(repository, "linux");

      await toldOf(paths, repository, "ready");
      stop();

      expect(failed()).toBe(0);
    } finally {
      chmodSync(join(repository, "locked"), 0o755);
    }
  });
});
