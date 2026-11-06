import { lstatSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { applyLinesRpc } from "../shared/diff";
import {
  commitAll,
  indexFile,
  inRepository,
  linkDirectory,
  runGit,
  worktreeFile,
  writeFile,
} from "../test/repository";
import { sides } from "../test/staging";
import { applyFile, applyLines, readDiff } from "./diff";

// Commits a file `a/b`, which `before` changes, and puts a symlink in place of its directory, to one
// that has a `b` of its own. git takes `a/b` for deleted, as it never looks beyond a symlink.
function setUp(repository: string, before: (repository: string) => void): void {
  writeFile(repository, "a/b", "1\n2\n");
  commitAll(repository);
  before(repository);
  writeFile(repository, ".git/outside/b", "outside\n");
  linkDirectory(repository, "a", ".git/outside");
}

// The index's version of `a/b`: as HEAD has it, or with changes of its own, which `git rm` keeps
// unless forced, as the file it finds through the symlink is neither.
test.each<[string, (repository: string) => void]>([
  ["as HEAD has it", () => {}],
  [
    "with changes of its own",
    (repository) => {
      writeFile(repository, "a/b", "staged\n");
      runGit(repository, ["add", "--", "a/b"]);
    },
  ],
])("stage file: a file whose directory became a symlink, in the index %s", async (_, before) => {
  await inRepository(async (repository) => {
    setUp(repository, before);

    const { version } = await readDiff({ directory: repository, path: "a/b", side: "unstaged" });

    await expect(
      applyFile({ directory: repository, path: "a/b", operation: "stage", version }),
    ).resolves.toStrictEqual({ status: "applied" });

    expect(runGit(repository, ["status", "--porcelain", "--untracked-files=all"])).toBe(
      "D  a/b\n?? a\n",
    );
  });
});

test("unstage file: a file whose directory became a symlink", async () => {
  await inRepository(async (repository) => {
    setUp(repository, () => {});
    runGit(repository, ["rm", "--quiet", "--cached", "--", "a/b"]);

    const { version } = await readDiff({ directory: repository, path: "a/b", side: "staged" });

    await expect(
      applyFile({ directory: repository, path: "a/b", operation: "unstage", version }),
    ).resolves.toStrictEqual({ status: "applied" });

    expect(runGit(repository, ["status", "--porcelain", "--untracked-files=all"])).toBe(
      " D a/b\n?? a\n",
    );
  });
});

// Each operation on a line, the first of the file's deletion, and what the index then has of `a/b`.
test.each<["stage" | "unstage", (repository: string) => void, string]>([
  ["stage", () => {}, "2\n"],
  [
    "unstage",
    (repository) => {
      runGit(repository, ["rm", "--quiet", "--cached", "--", "a/b"]);
    },
    "1\n",
  ],
])("%s lines: a file whose directory became a symlink", async (operation, before, staged) => {
  await inRepository(async (repository) => {
    setUp(repository, before);

    const { version } = await readDiff({
      directory: repository,
      path: "a/b",
      side: sides[operation],
    });

    await expect(
      applyLines({
        directory: repository,
        path: "a/b",
        operation,
        version,
        lines: [{ hunk: 0, line: 0 }],
      }),
    ).resolves.toStrictEqual({ status: "applied" });

    expect(indexFile(repository, "a/b")?.toString()).toBe(staged);
  });
});

test("discard lines: a file whose directory became a symlink changes nothing, as git won't write beyond it", async () => {
  await inRepository(async (repository) => {
    setUp(repository, () => {});

    const { version } = await readDiff({ directory: repository, path: "a/b", side: "unstaged" });

    const answer = await applyLines({
      directory: repository,
      path: "a/b",
      operation: "discard",
      version,
      lines: [{ hunk: 0, line: 0 }],
    });

    expect(applyLinesRpc.output.parse(answer)).toStrictEqual({ status: "unwritable" });

    expect(runGit(repository, ["status", "--porcelain", "--untracked-files=all"])).toBe(
      " D a/b\n?? a\n",
    );
    expect(worktreeFile(repository, ".git/outside/b")?.toString()).toBe("outside\n");
  });
});

test("discard file: a file whose directory became a symlink puts the directory back in its place, as git restore does", async () => {
  await inRepository(async (repository) => {
    setUp(repository, () => {});

    const { version } = await readDiff({ directory: repository, path: "a/b", side: "unstaged" });

    await expect(
      applyFile({ directory: repository, path: "a/b", operation: "discard", version }),
    ).resolves.toStrictEqual({ status: "applied" });

    expect(runGit(repository, ["status", "--porcelain", "--untracked-files=all"])).toBe("");
    expect(lstatSync(join(repository, "a")).isDirectory()).toBe(true);
    expect(worktreeFile(repository, ".git/outside/b")?.toString()).toBe("outside\n");
  });
});
