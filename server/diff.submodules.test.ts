import { rmSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { changesRpc } from "../shared/changes";
import type { RepositoryKind } from "../shared/diff";
import { commitAll, inRepository, runGit, writeFile, worktreeFile } from "../test/repository";
import { nestRepository, withSubmodule } from "../test/submodules";
import { listChanges } from "./changes";
import { applyFile, readDiff } from "./diff";
import { applyGroup, readGroup } from "./groups";

// Checks out another commit of the submodule `sub`, with its file `d/s` changed.
function moveOn(repository: string, content: string): void {
  writeFile(join(repository, "sub"), "d/s", content);
  commitAll(join(repository, "sub"));
}

function status(repository: string): string {
  return runGit(repository, ["status", "--porcelain"]);
}

// Changes to the submodule `sub`.
const changes = {
  "at another commit": (repository: string) => {
    moveOn(repository, "t\n");
  },
  "with a changed file": (repository: string) => {
    writeFile(join(repository, "sub"), "d/s", "t\n");
  },
  "with an untracked file": (repository: string) => {
    writeFile(join(repository, "sub"), "u", "u\n");
  },
  "at another commit, with a changed file": (repository: string) => {
    moveOn(repository, "t\n");
    writeFile(join(repository, "sub"), "d/s", "u\n");
  },
  deleted: (repository: string) => {
    rmSync(join(repository, "sub"), { recursive: true });
  },
  "at another commit, staged": (repository: string) => {
    moveOn(repository, "t\n");
    runGit(repository, ["add", "sub"]);
  },
  "at another commit, staged, with a changed file": (repository: string) => {
    moveOn(repository, "t\n");
    runGit(repository, ["add", "sub"]);
    writeFile(join(repository, "sub"), "d/s", "u\n");
  },
};

type Change = keyof typeof changes;

const submodule = [["sub", "submodule"]] as const;
const files = [["sub", "submodule files"]] as const;

test.each<[Change, { modified: readonly unknown[]; staged: readonly unknown[] }]>([
  ["at another commit", { modified: submodule, staged: [] }],
  ["with a changed file", { modified: files, staged: [] }],
  ["with an untracked file", { modified: files, staged: [] }],
  ["at another commit, with a changed file", { modified: submodule, staged: [] }],
  ["deleted", { modified: submodule, staged: [] }],
  ["at another commit, staged", { modified: [], staged: submodule }],
  ["at another commit, staged, with a changed file", { modified: files, staged: submodule }],
])("lists a submodule %s with what its diff in each group is of", async (change, listed) => {
  await withSubmodule(async (repository) => {
    changes[change](repository);

    const answer = await listChanges({ directory: repository });

    expect(changesRpc.output.parse(answer)).toStrictEqual(answer);
    expect(answer).toMatchObject({ repositories: { ...listed, untracked: [] } });
  });
});

test.each<[Change, "modified" | "staged", "unstaged" | "staged", RepositoryKind]>([
  ["at another commit", "modified", "unstaged", "submodule"],
  ["with a changed file", "modified", "unstaged", "submodule files"],
  ["deleted", "modified", "unstaged", "submodule"],
  ["at another commit, staged", "staged", "staged", "submodule"],
  ["at another commit, staged, with a changed file", "modified", "unstaged", "submodule files"],
  ["at another commit, staged, with a changed file", "staged", "staged", "submodule"],
])("reads the diff of a submodule %s, in %s, without lines", async (change, group, side, kind) => {
  await withSubmodule(async (repository) => {
    changes[change](repository);

    await expect(readDiff({ directory: repository, path: "sub", side })).resolves.toMatchObject({
      kind,
      hunks: [],
      added: 0,
      removed: 0,
    });
    await expect(readGroup({ directory: repository, group })).resolves.toMatchObject({
      files: [{ path: "sub", kind, hunks: [] }],
    });
  });
});

test("lists a repository inside the worktree that's untracked as a repository, by its directory, and reads it as one, without lines", async () => {
  await inRepository(async (repository) => {
    nestRepository(repository, "nested");

    await expect(listChanges({ directory: repository })).resolves.toMatchObject({
      untracked: ["nested/"],
      repositories: { modified: [], untracked: [["nested/", "repository"]], staged: [] },
    });
    await expect(
      readDiff({ directory: repository, path: "nested/", side: "unstaged" }),
    ).resolves.toMatchObject({ kind: "repository", hunks: [], added: 0, removed: 0 });
    await expect(readGroup({ directory: repository, group: "untracked" })).resolves.toMatchObject({
      files: [{ path: "nested/", kind: "repository", hunks: [] }],
    });
  });
});

test("stages a submodule's change of commit, as git add does, and unstages it, as git reset does", async () => {
  await withSubmodule(async (repository) => {
    moveOn(repository, "t\n");

    const unstaged = await readDiff({ directory: repository, path: "sub", side: "unstaged" });

    await expect(
      applyFile({
        directory: repository,
        path: "sub",
        operation: "stage",
        version: unstaged.version,
      }),
    ).resolves.toStrictEqual({ status: "applied" });
    expect(status(repository)).toBe("M  sub\n");

    const staged = await readDiff({ directory: repository, path: "sub", side: "staged" });

    await expect(
      applyFile({
        directory: repository,
        path: "sub",
        operation: "unstage",
        version: staged.version,
      }),
    ).resolves.toStrictEqual({ status: "applied" });
    expect(status(repository)).toBe(" M sub\n");
  });
});

test("stages a submodule's change of commit read before another file changed", async () => {
  await withSubmodule(async (repository) => {
    writeFile(repository, "a", "a\n");
    commitAll(repository);
    moveOn(repository, "t\n");

    const { version } = await readDiff({ directory: repository, path: "sub", side: "unstaged" });

    writeFile(repository, "a", "b\n");

    await expect(
      applyFile({ directory: repository, path: "sub", operation: "stage", version }),
    ).resolves.toStrictEqual({ status: "applied" });
    expect(status(repository)).toBe(" M a\nM  sub\n");
  });
});

test("staging a submodule's change of commit read before it moved on to another is stale", async () => {
  await withSubmodule(async (repository) => {
    moveOn(repository, "t\n");

    const { version } = await readDiff({ directory: repository, path: "sub", side: "unstaged" });

    moveOn(repository, "u\n");

    await expect(
      applyFile({ directory: repository, path: "sub", operation: "stage", version }),
    ).resolves.toStrictEqual({ status: "stale" });
    expect(status(repository)).toBe(" M sub\n");
  });
});

test("staging the modified files stages a submodule's change of commit, but not its files' changes, and unstaging the staged ones unstages it", async () => {
  await withSubmodule(async (repository) => {
    writeFile(repository, "a", "a\n");
    commitAll(repository);
    changes["at another commit, with a changed file"](repository);
    writeFile(repository, "a", "b\n");

    await applyGroup({
      directory: repository,
      group: "modified",
      operation: "stage",
      paths: ["a", "sub"],
    });

    expect(status(repository)).toBe("M  a\nMM sub\n");

    await applyGroup({
      directory: repository,
      group: "staged",
      operation: "unstage",
      paths: ["a", "sub"],
    });

    expect(status(repository)).toBe(" M a\n M sub\n");
  });
});

test("staging the modified files leaves a submodule whose files alone changed as it is", async () => {
  await withSubmodule(async (repository) => {
    writeFile(repository, "a", "a\n");
    commitAll(repository);
    changes["with a changed file"](repository);
    writeFile(repository, "a", "b\n");

    await applyGroup({
      directory: repository,
      group: "modified",
      operation: "stage",
      paths: ["a", "sub"],
    });

    expect(status(repository)).toBe("M  a\n M sub\n");
  });
});

test.each<Change>(["at another commit, with a changed file", "with a changed file"])(
  "discarding the modified files leaves a submodule %s as it is, though submodule.recurse is set",
  async (change) => {
    await withSubmodule(async (repository) => {
      const sub = join(repository, "sub");

      writeFile(repository, "a", "a\n");
      commitAll(repository);
      runGit(repository, ["config", "submodule.recurse", "true"]);
      changes[change](repository);
      writeFile(repository, "a", "b\n");

      const head = runGit(sub, ["rev-parse", "HEAD"]);
      const file = worktreeFile(sub, "d/s");

      await applyGroup({
        directory: repository,
        group: "modified",
        operation: "discard",
        paths: ["a", "sub"],
      });
      await applyFile({ directory: repository, path: "sub", operation: "discard", version: null });

      expect(worktreeFile(repository, "a")?.toString()).toBe("a\n");
      expect(runGit(sub, ["rev-parse", "HEAD"])).toBe(head);
      expect(worktreeFile(sub, "d/s")).toStrictEqual(file);
    });
  },
);

test.each(["stage", "discard"] as const)(
  "acting on the untracked files with %s leaves a repository inside the worktree untracked",
  async (operation) => {
    await inRepository(async (repository) => {
      nestRepository(repository, "nested");
      writeFile(repository, "a", "a\n");

      await applyGroup({
        directory: repository,
        group: "untracked",
        operation,
        paths: ["a", "nested/"],
      });

      await expect(listChanges({ directory: repository })).resolves.toMatchObject({
        untracked: ["nested/"],
      });
      expect(worktreeFile(join(repository, "nested"), "null")?.toString()).toBe("n\n");
    });
  },
);

test("an untracked file in place of a submodule the index no longer has is an ordinary file", async () => {
  await withSubmodule(async (repository) => {
    runGit(repository, ["rm", "--cached", "--quiet", "sub"]);
    rmSync(join(repository, "sub"), { recursive: true });
    writeFile(repository, "sub", "f\n");

    await expect(listChanges({ directory: repository })).resolves.toMatchObject({
      untracked: ["sub"],
      staged: ["sub"],
      repositories: { modified: [], untracked: [], staged: [["sub", "submodule"]] },
    });
    await expect(
      readDiff({ directory: repository, path: "sub", side: "unstaged" }),
    ).resolves.toMatchObject({ kind: "text", added: 1 });

    await applyGroup({
      directory: repository,
      group: "untracked",
      operation: "stage",
      paths: ["sub"],
    });

    expect(runGit(repository, ["ls-files", "--stage", "sub"])).toMatch(/^100644 /u);
  });
});
