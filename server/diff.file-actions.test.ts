import * as fc from "fast-check";
import { expect, test } from "vitest";

import {
  deleteFile,
  inRepository,
  runGit,
  timeout,
  worktreeFile,
  writeFile,
  writeSymlink,
} from "../test/repository";
import {
  diffCommands,
  file,
  fileState,
  operations,
  setUp,
  sides,
  sources,
  targets,
} from "../test/staging";
import type { File, Operation, Side } from "../test/staging";
import { applyFile, readDiff } from "./diff";

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
  "%s file leaves alone a file whose diff has no changes, such as an ignored one",
  async (operation) => {
    await inRepository(async (repository) => {
      writeFile(repository, ".git/info/exclude", "a\n");
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

test("discard file deletes an untracked file, though the user's config says git clean needs --force", async () => {
  await inRepository(async (repository) => {
    runGit(repository, ["config", "clean.requireForce", "true"]);
    writeFile(repository, "a", "a\n");

    const { version } = await readDiff({ directory: repository, path: "a", side: "unstaged" });

    await applyFile({ directory: repository, path: "a", operation: "discard", version });

    expect(worktreeFile(repository, "a")).toBeUndefined();
  });
});

// Ten lines, so changing one leaves the file similar enough to its original for a rename or copy.
const tenLines = "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n";

// Each writes a file `b` the worktree adds, renames or copies, beside a committed file `a`, with
// what git status says once `b` is added intent-to-add and discarded: `git restore` leaves such a
// file, and `git clean` won't delete it.
const intentToAdd: [string, (repository: string) => void, string][] = [
  [
    "a new file",
    (repository) => {
      writeFile(repository, "b", "b\n");
    },
    "",
  ],
  [
    "a file deleted from the index",
    (repository) => {
      writeFile(repository, "b", "b\n");
      runGit(repository, ["add", "--all"]);
      runGit(repository, ["commit", "--quiet", "--message", "Commit"]);
      runGit(repository, ["rm", "--cached", "--quiet", "--", "b"]);
      writeFile(repository, "b", "c\n");
    },
    "D  b\n",
  ],
  [
    "a file moved",
    (repository) => {
      deleteFile(repository, "a");
      writeFile(repository, "b", tenLines);
    },
    "",
  ],
  [
    "a copy",
    (repository) => {
      runGit(repository, ["config", "status.renames", "copies"]);
      writeFile(repository, "b", tenLines);
      writeFile(repository, "a", tenLines.replace("5", "five"));
    },
    " M a\n",
  ],
];

test.each(intentToAdd)(
  "discard file deletes a file added intent-to-add: %s",
  async (_, write, status) => {
    await inRepository(async (repository) => {
      writeFile(repository, "a", tenLines);
      runGit(repository, ["add", "--all"]);
      runGit(repository, ["commit", "--quiet", "--message", "Commit"]);
      write(repository);
      runGit(repository, ["add", "--intent-to-add", "--", "b"]);

      const { version } = await readDiff({ directory: repository, path: "b", side: "unstaged" });

      await expect(
        applyFile({ directory: repository, path: "b", operation: "discard", version }),
      ).resolves.toStrictEqual({ status: "applied" });
      expect(runGit(repository, ["status", "--porcelain"])).toBe(status);
    });
  },
);

// Each side's diff, by the status git gives it, once each operation acts on a file that became a
// symlink in the index only.
const typeChanges: Record<Operation, Record<Side, string>> = {
  stage: { staged: "", unstaged: "" },
  unstage: { staged: "", unstaged: "" },
  discard: { staged: "T\ta\n", unstaged: "" },
};

test.each(operations)("%s file: a file that became a symlink", async (operation) => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    runGit(repository, ["add", "--all"]);
    runGit(repository, ["commit", "--quiet", "--message", "Commit"]);
    deleteFile(repository, "a");
    writeSymlink(repository, "a", "b");
    runGit(repository, ["add", "--all"]);
    deleteFile(repository, "a");
    writeFile(repository, "a", "a\n");

    const diff = await readDiff({ directory: repository, path: "a", side: sides[operation] });

    await applyFile({ directory: repository, path: "a", operation, version: diff.version });

    expect(diff.kind).toBe("symlink");
    expect({
      staged: runGit(repository, [...diffCommands.staged, "--name-status", "--", "a"]),
      unstaged: runGit(repository, [...diffCommands.unstaged, "--name-status", "--", "a"]),
    }).toStrictEqual(typeChanges[operation]);
  });
});
