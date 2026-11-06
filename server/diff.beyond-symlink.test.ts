import { expect, test } from "vitest";

import { commitAll, inRepository, linkDirectory, runGit, writeFile } from "../test/repository";
import { applyFile, readDiff } from "./diff";

// Commits a file `a/b`, which `before` changes, and puts a symlink in place of its directory, to one
// that has a `b` of its own. git takes `a/b` for deleted, as it never looks beyond a symlink.
function setUp(repository: string, before: (repository: string) => void): void {
  writeFile(repository, "a/b", "b\n");
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
