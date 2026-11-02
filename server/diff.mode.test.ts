import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { FileVersions } from "../test/file-contents";
import { fileVersions } from "../test/file-contents";
import { canCoexist, filePath } from "../test/file-names";
import { tenLines } from "../test/renames";
import {
  commitAll,
  deleteFile,
  indexMode,
  inRepository,
  makeExecutable,
  runGit,
  timeout,
  worktreeFile,
  worktreeMode,
  writeFile,
} from "../test/repository";
import { fileState, operations, sides, sources, targets } from "../test/staging";
import type { Operation, Side } from "../test/staging";
import { applyMode, readDiff } from "./diff";

type Version = keyof FileVersions;

// Whether each version of a file is executable.
type Executable = Record<Version, boolean>;

function gitMode(executable: boolean): string {
  return executable ? "100755" : "100644";
}

// A file in every version, which a mode change needs.
const contents = fileVersions.filter(
  (versions): versions is Record<Version, Buffer> =>
    versions.head !== undefined && versions.index !== undefined && versions.worktree !== undefined,
);

const executable: fc.Arbitrary<Executable> = fc.record({
  head: fc.boolean(),
  index: fc.boolean(),
  worktree: fc.boolean(),
});

// Whether each version is executable, where the version the operation changes and the one whose
// file it puts there differ.
function modeChangeFor(operation: Operation): fc.Arbitrary<Executable> {
  return executable.map((each) => ({
    ...each,
    [targets[operation]]: !each[sources[operation]],
  }));
}

function writeVersion(
  repository: string,
  path: string,
  content: Buffer,
  isExecutable: boolean,
): void {
  writeFile(repository, path, content);
  makeExecutable(repository, path, isExecutable);
}

// Commits the file's HEAD version, stages its index version and leaves its worktree version, each
// executable or not.
function setUpModes(
  repository: string,
  path: string,
  versions: Record<Version, Buffer>,
  made: Executable,
): void {
  writeVersion(repository, path, versions.head, made.head);
  commitAll(repository);
  writeVersion(repository, path, versions.index, made.index);
  runGit(repository, ["add", "--all"]);
  writeVersion(repository, path, versions.worktree, made.worktree);
}

// Undefined for the index if it doesn't have the file.
interface Modes {
  index: string | undefined;
  worktree: string;
}

function modes(repository: string, path: string): Modes {
  return {
    index: indexMode(repository, path),
    worktree: worktreeMode(repository, path),
  };
}

// The versions each side's diff goes between.
const ends: Record<Side, [Version, Version]> = {
  unstaged: ["index", "worktree"],
  staged: ["head", "index"],
};

// The mode change of the side's diff of a file with each version executable or not.
function modeChange(side: Side, made: Executable): { old: string; new: string } | undefined {
  const [from, to] = ends[side];

  return made[from] === made[to] ? undefined : { old: gitMode(made[from]), new: gitMode(made[to]) };
}

test.each(["unstaged", "staged"] as const)(
  "reads the %s diff's mode change from the mode of each version it goes between",
  async (side) => {
    await fc.assert(
      fc.asyncProperty(filePath, contents, executable, async (path, versions, made) => {
        await inRepository(async (repository) => {
          setUpModes(repository, path, versions, made);

          const diff = await readDiff({ directory: repository, path, side });

          expect(diff.mode).toStrictEqual(modeChange(side, made));
        });
      }),
      { numRuns: 20 },
    );
  },
  timeout,
);

test("reads a binary file's mode change", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\0");
    commitAll(repository);
    writeFile(repository, "a", "b\0");
    makeExecutable(repository, "a");

    const diff = await readDiff({
      directory: repository,
      path: "a",
      side: "unstaged",
    });

    expect(diff).toMatchObject({
      kind: "binary",
      mode: { old: "100644", new: "100755" },
    });
  });
});

test.each(operations)(
  "%s mode change: gives the version it changes the other version's mode, and leaves the lines",
  async (operation) => {
    await fc.assert(
      fc.asyncProperty(
        filePath,
        contents,
        modeChangeFor(operation),
        async (path, versions, made) => {
          await inRepository(async (repository) => {
            setUpModes(repository, path, versions, made);

            const { version } = await readDiff({
              directory: repository,
              path,
              side: sides[operation],
            });

            const before = fileState(repository, path);

            await expect(
              applyMode({ directory: repository, path, operation, version }),
            ).resolves.toStrictEqual({ status: "applied" });

            expect(fileState(repository, path)).toStrictEqual(before);
            expect(modes(repository, path)).toStrictEqual({
              index: gitMode(made.index),
              worktree: gitMode(made.worktree),
              [targets[operation]]: gitMode(made[sources[operation]]),
            });
          });
        },
      ),
      { numRuns: 20 },
    );
  },
  timeout,
);

interface Rename {
  from: string;
  to: string;
  // The new path's lines: the old path's, or those with one changed.
  content: Buffer;
}

const renames: fc.Arbitrary<Rename> = fc
  .record({
    from: filePath,
    to: filePath,
    content: fc
      .constantFrom(tenLines, tenLines.replace("5", "five"))
      .map((text) => Buffer.from(text)),
  })
  .filter(({ from, to }) => canCoexist([from, to]));

// Commits the file at its old path, then moves it to its new one and makes it executable: in the
// index, on the staged side, or as `mv` and `chmod` leave it.
function renameMakingExecutable(
  repository: string,
  side: Side,
  { from, to, content }: Rename,
): void {
  writeFile(repository, from, tenLines);
  commitAll(repository);
  deleteFile(repository, from);
  writeFile(repository, to, content);
  makeExecutable(repository, to);

  if (side === "staged") {
    runGit(repository, ["add", "--all"]);
  }
}

// What a file renamed and made executable is at its old path and its new one, once the operation
// acts on its mode change, as `git status` would show it before: staged, or moved in the worktree,
// as `mv` leaves it. Staging it stages the rename with it, and leaves the changed lines unstaged.
function afterRename(operation: Operation, content: Buffer) {
  return {
    stage: {
      from: { index: undefined, worktree: undefined },
      to: { index: Buffer.from(tenLines), worktree: content },
      modes: { index: "100755", worktree: "100755" },
    },
    unstage: {
      from: { index: undefined, worktree: undefined },
      to: { index: content, worktree: content },
      modes: { index: "100644", worktree: "100755" },
    },
    discard: {
      from: { index: Buffer.from(tenLines), worktree: undefined },
      to: { index: undefined, worktree: content },
      modes: { index: undefined, worktree: "100644" },
    },
  }[operation];
}

test.each(operations)(
  "%s mode change of a renamed file: changes the mode of only its new path",
  async (operation) => {
    await fc.assert(
      fc.asyncProperty(renames, async (rename) => {
        await inRepository(async (repository) => {
          const { from, to, content } = rename;

          renameMakingExecutable(repository, sides[operation], rename);

          const diff = await readDiff({
            directory: repository,
            path: to,
            side: sides[operation],
          });

          await applyMode({
            directory: repository,
            path: to,
            operation,
            version: diff.version,
          });

          expect(diff).toMatchObject({
            renamedFrom: from,
            mode: { old: "100644", new: "100755" },
          });
          expect({
            from: fileState(repository, from),
            to: fileState(repository, to),
            modes: modes(repository, to),
          }).toStrictEqual(afterRename(operation, content));
        });
      }),
      { numRuns: 15 },
    );
  },
  timeout,
);

test("refuses to act on a mode change the diff doesn't have", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    commitAll(repository);
    writeFile(repository, "a", "b\n");

    const { version } = await readDiff({
      directory: repository,
      path: "a",
      side: "unstaged",
    });

    await expect(
      applyMode({
        directory: repository,
        path: "a",
        operation: "stage",
        version,
      }),
    ).rejects.toThrow("The diff has no mode change.");
  });
});

test("refuses a mode change's action as stale, and changes nothing, once the diff has changed since it was read", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    commitAll(repository);
    makeExecutable(repository, "a");

    const { version } = await readDiff({
      directory: repository,
      path: "a",
      side: "unstaged",
    });

    writeFile(repository, "a", "b\n");

    await expect(
      applyMode({
        directory: repository,
        path: "a",
        operation: "discard",
        version,
      }),
    ).resolves.toStrictEqual({ status: "stale" });
    expect(worktreeMode(repository, "a")).toBe("100755");
    expect(worktreeFile(repository, "a")?.toString()).toBe("b\n");
  });
});
