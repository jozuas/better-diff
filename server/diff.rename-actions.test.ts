import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { FileVersions } from "../test/file-contents";
import { fileVersions } from "../test/file-contents";
import { canCoexist, filePath } from "../test/file-names";
import { commitTenLines, moveChangingLater, moveRefusedLater } from "../test/renames";
import { commitAll, inRepository, runGit, timeout, writeFile } from "../test/repository";
import {
  diffAlgorithm,
  diffCommands,
  fileState,
  operations,
  selectedLines,
  setUp,
  sides,
  sources,
  targets,
} from "../test/staging";
import type { File, FileState, Operation, Side } from "../test/staging";
import { applyFile, applyLines, readDiff } from "./diff";

interface Rename {
  from: string;
  to: string;
  versions: FileVersions;
}

// The versions each side's diff goes between.
const ends: Record<Side, (keyof FileVersions)[]> = {
  unstaged: ["index", "worktree"],
  staged: ["head", "index"],
};

// A rename on the side, if git pairs the versions: it doesn't pair an empty or missing file.
function renamesOn(side: Side): fc.Arbitrary<Rename> {
  return fc
    .record({ from: filePath, to: filePath, versions: fileVersions })
    .filter(
      ({ from, to, versions }) =>
        canCoexist([from, to]) && ends[side].every((end) => (versions[end]?.length ?? 0) > 0),
    );
}

interface Paths<T> {
  from: T;
  to: T;
}

// The file at each path, renamed between the versions the side's diff goes between: in the index,
// or in the worktree with the index as it was, as `mv` leaves it.
function renamedFiles({ from, to, versions }: Rename, side: Side): Paths<File> {
  const staged = side === "staged";

  return {
    from: {
      path: from,
      versions: {
        head: versions.head,
        index: staged ? undefined : versions.index,
        worktree: undefined,
      },
    },
    to: {
      path: to,
      versions: {
        head: undefined,
        index: staged ? versions.index : undefined,
        worktree: versions.worktree,
      },
    },
  };
}

function states(repository: string, { from, to }: Paths<File>): Paths<FileState> {
  return { from: fileState(repository, from.path), to: fileState(repository, to.path) };
}

// What acting on lines of the renamed file leaves at each path: at the new one, what acting on them
// leaves where the file isn't renamed. Staging a change stages the rename with it, and staging none
// changes nothing.
function afterLines(
  operation: Operation,
  changed: boolean,
  before: Paths<FileState>,
  unrenamed: FileState,
): Paths<FileState> {
  const target = targets[operation];

  if (operation === "stage" && !changed) {
    return before;
  }

  return {
    from: operation === "stage" ? { ...before.from, index: undefined } : before.from,
    to: { ...before.to, [target]: unrenamed[target] },
  };
}

// What acting on the renamed file leaves at each path: the version the operation puts in its
// target, at both paths, but for unstaging, which leaves the original's deletion staged.
function afterFile(
  operation: Operation,
  before: Paths<FileState>,
  { from, to }: Paths<File>,
): Paths<FileState> {
  const target = targets[operation];
  const source = sources[operation];

  return {
    from:
      operation === "unstage" ? before.from : { ...before.from, [target]: from.versions[source] },
    to: { ...before.to, [target]: to.versions[source] },
  };
}

test.each(operations)(
  "%s lines of a renamed file as of the file where it is, keeping the rename",
  async (operation) => {
    await fc.assert(
      fc.asyncProperty(
        renamesOn(sides[operation]),
        diffAlgorithm,
        fc.func(fc.boolean()),
        async (rename, algorithm, isSelected) => {
          const side = sides[operation];
          const files = renamedFiles(rename, side);
          const { path } = files.to;

          await inRepository(async (renamed) => {
            setUp(renamed, [files.from, files.to], algorithm);

            const diff = await readDiff({ directory: renamed, path, side });

            // git pairs the paths only if the versions are similar enough.
            fc.pre(diff.renamedFrom === rename.from);

            await inRepository(async (unrenamed) => {
              setUp(unrenamed, [{ path, versions: rename.versions }], algorithm);

              const unrenamedDiff = await readDiff({ directory: unrenamed, path, side });

              expect(diff.hunks).toStrictEqual(unrenamedDiff.hunks);

              const lines = selectedLines(diff, isSelected);
              const before = states(renamed, files);

              await applyLines({
                directory: renamed,
                path,
                operation,
                version: diff.version,
                lines,
              });
              await applyLines({
                directory: unrenamed,
                path,
                operation,
                version: unrenamedDiff.version,
                lines,
              });

              const changed = lines.some(
                ({ hunk, line }) => diff.hunks[hunk]?.lines[line]?.kind !== "context",
              );

              expect(states(renamed, files)).toStrictEqual(
                afterLines(operation, changed, before, fileState(unrenamed, path)),
              );
            });
          });
        },
      ),
      { numRuns: 30 },
    );
  },
  timeout,
);

test.each(operations)(
  "%s file: makes or undoes a rename and the file's other changes, at both paths, or when unstaging at the new one",
  async (operation) => {
    await fc.assert(
      fc.asyncProperty(renamesOn(sides[operation]), async (rename) => {
        const side = sides[operation];
        const files = renamedFiles(rename, side);

        await inRepository(async (repository) => {
          setUp(repository, [files.from, files.to], "myers");

          const diff = await readDiff({ directory: repository, path: files.to.path, side });

          fc.pre(diff.renamedFrom === rename.from);

          const before = states(repository, files);

          await expect(
            applyFile({
              directory: repository,
              path: files.to.path,
              operation,
              version: diff.version,
            }),
          ).resolves.toStrictEqual({ status: "applied" });

          expect(states(repository, files)).toStrictEqual(afterFile(operation, before, files));
        });
      }),
      { numRuns: 30 },
    );
  },
  timeout,
);

function commitRenamed(repository: string): void {
  writeFile(repository, "a", "a\n");
  commitAll(repository);
  runGit(repository, ["mv", "a", "b"]);
}

test("unstage file: the new path of a staged rename, and nothing else", async () => {
  await inRepository(async (repository) => {
    commitRenamed(repository);
    writeFile(repository, "c", "c\n");
    runGit(repository, ["add", "--all"]);

    const { version } = await readDiff({ directory: repository, path: "b", side: "staged" });

    await applyFile({ directory: repository, path: "b", operation: "unstage", version });

    expect(runGit(repository, ["status", "--porcelain"])).toBe("D  a\nA  c\n?? b\n");
  });
});

test("unstage file: the new path of a staged rename whose original path a directory has taken, leaving the directory's file staged", async () => {
  await inRepository(async (repository) => {
    commitRenamed(repository);
    writeFile(repository, "a/b", "b\n");
    runGit(repository, ["add", "--all"]);

    const { version } = await readDiff({ directory: repository, path: "b", side: "staged" });

    await applyFile({ directory: repository, path: "b", operation: "unstage", version });

    expect(runGit(repository, ["status", "--porcelain", "--untracked-files=all"])).toBe(
      "D  a\nA  a/b\n?? b\n",
    );
  });
});

test.each(["stage", "discard"] as const)(
  "%s file: the changes made to a file after its rename was staged",
  async (operation) => {
    await inRepository(async (repository) => {
      commitRenamed(repository);
      writeFile(repository, "b", "b\n");

      const { version } = await readDiff({ directory: repository, path: "b", side: "unstaged" });

      await applyFile({ directory: repository, path: "b", operation, version });

      expect(runGit(repository, [...diffCommands.unstaged, "--", "b"])).toBe("");
    });
  },
);

test.each([
  ["no longer pairs it with its original", "b", moveChangingLater, " D a\n?? b\n"],
  ["won't add it to diff it as renamed", "git~1/b", moveRefusedLater, " D a\n?? git~1/\n"],
] as const)(
  "discard file: stale for a moved file, where git %s",
  async (_, path, moveLater, status) => {
    await inRepository(async (repository) => {
      commitTenLines(repository);
      const later = moveLater(repository);
      const { version } = await readDiff({ directory: repository, path, side: "unstaged" });
      later();

      await expect(
        applyFile({ directory: repository, path, operation: "discard", version }),
      ).resolves.toStrictEqual({ status: "stale" });
      expect(runGit(repository, ["status", "--porcelain"])).toBe(status);
    });
  },
);
