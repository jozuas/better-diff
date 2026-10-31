import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { FileVersions } from "../test/file-contents";
import { inRepository, runGit, timeout, writeFile } from "../test/repository";
import { diffCommands, file, fileState, operations, setUp, sides, targets } from "../test/staging";
import type { File, Operation, Side } from "../test/staging";
import { applyFile, readDiff } from "./diff";

// The version whose file each operation puts in its target.
const sources: Record<Operation, keyof FileVersions> = {
  stage: "worktree",
  unstage: "head",
  discard: "index",
};

// A binary file, which git shows no lines for.
const binary: File = {
  path: "a",
  versions: { head: Buffer.from("a\0"), index: Buffer.from("b\0"), worktree: Buffer.from("c\0") },
};

test.each(operations)(
  "%s file: makes or undoes all of the file's changes",
  async (operation) => {
    await fc.assert(
      fc.asyncProperty(file, async ({ path, versions }) => {
        await inRepository(async (repository) => {
          setUp(repository, [{ path, versions }], "myers");

          const diff = await readDiff({ directory: repository, path, side: sides[operation] });

          // A diff with no changes leaves the file alone, as the next test checks.
          fc.pre(diff.kind !== "unchanged");

          const before = fileState(repository, path);

          await expect(
            applyFile({ directory: repository, path, operation, version: diff.version }),
          ).resolves.toStrictEqual({ status: "applied" });

          expect(fileState(repository, path)).toStrictEqual({
            ...before,
            [targets[operation]]: versions[sources[operation]],
          });
        });
      }),
      { numRuns: 30, examples: [[binary]] },
    );
  },
  timeout,
);

test.each(operations)(
  "%s file leaves alone a file whose diff has no changes, such as an untracked one",
  async (operation) => {
    await inRepository(async (repository) => {
      runGit(repository, ["commit", "--quiet", "--allow-empty", "--message", "Commit"]);
      writeFile(repository, "a", "a\n");

      const { version } = await readDiff({
        directory: repository,
        path: "a",
        side: sides[operation],
      });

      const before = fileState(repository, "a");

      await expect(
        applyFile({ directory: repository, path: "a", operation, version }),
      ).resolves.toStrictEqual({ status: "applied" });

      expect(fileState(repository, "a")).toStrictEqual(before);
    });
  },
);

const modeChange = "diff --git a/a b/a\nold mode 100644\nnew mode 100755\n";

// Each side's diff, once each operation acts on a file made executable in the index only.
const modeDiffs: Record<Operation, Record<Side, string>> = {
  stage: { staged: "", unstaged: "" },
  unstage: { staged: "", unstaged: "" },
  discard: { staged: modeChange, unstaged: "" },
};

test.each(operations)("%s file: a mode change on its own", async (operation) => {
  await inRepository(async (repository) => {
    const same = Buffer.from("a\n");

    setUp(
      repository,
      [{ path: "a", versions: { head: same, index: same, worktree: same } }],
      "myers",
    );
    runGit(repository, ["update-index", "--chmod=+x", "--", "a"]);

    const diff = await readDiff({ directory: repository, path: "a", side: sides[operation] });

    await applyFile({ directory: repository, path: "a", operation, version: diff.version });

    expect(diff.kind).toBe("mode");
    expect({
      staged: runGit(repository, [...diffCommands.staged, "--", "a"]),
      unstaged: runGit(repository, [...diffCommands.unstaged, "--", "a"]),
    }).toStrictEqual(modeDiffs[operation]);
  });
});

test("unstage file: a new file before the first commit", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    runGit(repository, ["add", "--all"]);

    const { version } = await readDiff({ directory: repository, path: "a", side: "staged" });

    await applyFile({ directory: repository, path: "a", operation: "unstage", version });

    expect(fileState(repository, "a").index).toBeUndefined();
  });
});
