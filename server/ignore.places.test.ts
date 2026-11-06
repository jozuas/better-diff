import { chmodSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { ignore, readExcludesFile, status, untracked } from "../test/ignoring";
import { commitAll, inDirectory, inRepository, runGit, writeFile } from "../test/repository";

test("a rule goes on a line of its own at the end of the .gitignore, which is staged", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, ".gitignore", "a");
    commitAll(repository);
    writeFile(repository, ".gitignore", "a\nb");
    writeFile(repository, "c", "");

    await ignore({ directory: repository, place: { kind: "shared", inDirectory: "" }, rule: "/c" });
    await ignore({ directory: repository, place: { kind: "shared", inDirectory: "" }, rule: "d" });

    expect(readFileSync(join(repository, ".gitignore"), "utf8")).toBe("a\nb\n/c\nd\n");
    expect(runGit(repository, ["status", "--porcelain"])).toBe("M  .gitignore\n");
  });
});

test("a rule in a subdirectory's .gitignore makes it, and stages it", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "src/out/app.log", "");
    writeFile(repository, "src/b.log", "");

    await ignore({
      directory: repository,
      place: { kind: "shared", inDirectory: "src/out" },
      rule: "*.log",
    });

    expect(readFileSync(join(repository, "src/out/.gitignore"), "utf8")).toBe("*.log\n");
    expect(status(repository)).toStrictEqual(["staged src/out/.gitignore", "untracked src/b.log"]);
  });
});

test("a .gitignore its rule ignores isn't staged", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a.gitignore", "");

    await ignore({
      directory: repository,
      place: { kind: "shared", inDirectory: "" },
      rule: "*.gitignore",
    });

    expect(untracked(repository)).toStrictEqual([]);
    expect(runGit(repository, ["status", "--porcelain", "--ignored"])).toBe(
      "!! .gitignore\n!! a.gitignore\n",
    );
  });
});

test("a rule goes nowhere outside the repository", async () => {
  await inRepository(async (repository) => {
    await expect(
      ignore({ directory: repository, place: { kind: "shared", inDirectory: ".." }, rule: "a" }),
    ).rejects.toThrow(".. isn't in the repository.");
  });
});

test("a private rule goes in the excludes all the repository's worktrees read, which is made, and isn't staged", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "");
    commitAll(repository);
    runGit(repository, ["worktree", "add", "--quiet", "linked"]);

    const linked = join(repository, "linked");

    writeFile(linked, "a.log", "");
    writeFile(linked, "b.log", "");

    await ignore({ directory: linked, place: { kind: "private" }, rule: "/a.log" });

    expect(readFileSync(join(repository, ".git/info/exclude"), "utf8")).toBe("/a.log\n");
    expect(untracked(linked)).toStrictEqual(["b.log"]);
  });
});

test("a rule for all repositories goes in the file core.excludesFile names, with ~ as the home directory", async () => {
  await inRepository(async (repository) => {
    await inDirectory(async (home) => {
      const before = process.env["HOME"];

      process.env["HOME"] = home;

      try {
        runGit(repository, ["config", "core.excludesFile", "~/git/ignore"]);
        writeFile(repository, "a.log", "");
        writeFile(repository, "b.log", "");

        await expect(readExcludesFile({ directory: repository })).resolves.toStrictEqual({
          path: "~/git/ignore",
        });

        await ignore({ directory: repository, place: { kind: "global" }, rule: "/a.log" });

        expect(readFileSync(join(home, "git/ignore"), "utf8")).toBe("/a.log\n");
        expect(untracked(repository)).toStrictEqual(["b.log"]);
      } finally {
        process.env["HOME"] = before;
      }
    });
  });
});

test("a relative core.excludesFile is from the repository's root", async () => {
  await inRepository(async (repository) => {
    mkdirSync(join(repository, "src"));
    runGit(repository, ["config", "core.excludesFile", "excludes"]);
    writeFile(repository, "src/a.log", "");

    await ignore({ directory: join(repository, "src"), place: { kind: "global" }, rule: "*.log" });

    expect(readFileSync(join(realpathSync(repository), "excludes"), "utf8")).toBe("*.log\n");
    expect(untracked(repository)).toStrictEqual(["excludes"]);
  });
});

test("without core.excludesFile, a rule for all repositories goes nowhere", async () => {
  await inRepository(async (repository) => {
    await expect(readExcludesFile({ directory: repository })).resolves.toStrictEqual({
      path: null,
    });
    await expect(
      ignore({ directory: repository, place: { kind: "global" }, rule: "a" }),
    ).rejects.toThrow("core.excludesFile isn't set.");
  });
});

test("a rule goes in no .gitignore that can't be read", async () => {
  await inRepository(async (repository) => {
    const gitignore = join(repository, ".gitignore");

    writeFile(repository, ".gitignore", "a");
    chmodSync(gitignore, 0o200);

    await expect(
      ignore({ directory: repository, place: { kind: "shared", inDirectory: "" }, rule: "b" }),
    ).rejects.toThrow("EACCES");

    chmodSync(gitignore, 0o600);

    expect(readFileSync(gitignore, "utf8")).toBe("a");
  });
});
