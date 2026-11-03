import * as fc from "fast-check";
import { expect, test } from "vitest";

import { applyGroupRpc, groupRpc } from "../shared/diff";
import { fileVersions } from "../test/file-contents";
import type { FileVersions } from "../test/file-contents";
import { canCoexist, filePath } from "../test/file-names";
import {
  actOnEach,
  actOnEachListed,
  diffChanges,
  files,
  filesAndLater,
  groupActions,
  repositoryState,
  writeLater,
} from "../test/groups";
import type { GroupAction } from "../test/groups";
import { commitTenLines } from "../test/renames";
import {
  inCopyOf,
  inRepository,
  runGit,
  timeout,
  worktreeFile,
  writeFile,
} from "../test/repository";
import { setUp } from "../test/staging";
import type { File } from "../test/staging";
import { listChanges } from "./changes";
import { applyGroup, readGroup } from "./groups";

const groups = ["modified", "untracked", "staged"] as const;

// A few files, and some of their paths to select, in any order, and often a path none of them has.
const filesAndSelected: fc.Arbitrary<[File[], string[]]> = files.chain((all) =>
  fc.tuple(
    fc.constant(all),
    filePath.chain((other) =>
      fc.shuffledSubarray([...new Set([...all.map(({ path }) => path), other])]),
    ),
  ),
);

test.each(groups)(
  "reads those of the %s files at the paths, as reading all of them and keeping those does",
  async (group) => {
    await fc.assert(
      fc.asyncProperty(filesAndSelected, async ([all, selected]) => {
        await inRepository(async (repository) => {
          setUp(repository, all, "myers");

          const read = await readGroup({ directory: repository, group, paths: selected });
          const everything = await readGroup({ directory: repository, group });

          expect(read.files).toStrictEqual(
            everything.files.filter(({ path }) => selected.includes(path)),
          );
        });
      }),
      { numRuns: 20 },
    );
  },
  timeout,
);

// Acts on each selected file the group lists in turn, as its file bar would, then on each file that
// joins the group meanwhile, as acting on all of a group's files does: unstaging a renamed file
// leaves the deletion of the one it was renamed from staged.
async function actOnEachSelected(
  repository: string,
  action: GroupAction,
  selected: readonly string[],
): Promise<void> {
  const { [action.group]: listed } = await listChanges({ directory: repository });

  await actOnEach(
    repository,
    listed.filter((path) => selected.includes(path)),
    action.operation,
  );
  await actOnEachListed(repository, action, listed);
}

test.each(groupActions)(
  "$operation the selected $group files: does what doing it to each of them in turn does, and leaves the others",
  async (action) => {
    await fc.assert(
      fc.asyncProperty(filesAndSelected, async ([all, selected]) => {
        await inRepository(async (repository) => {
          setUp(repository, all, "myers");

          const paths = all.map(({ path }) => path);

          const outcome = await inCopyOf(repository, async (copy) => {
            const { version } = await readGroup({
              directory: repository,
              group: action.group,
              paths: selected,
            });

            const status = await applyGroup({
              directory: repository,
              version,
              paths: selected,
              ...action,
            });

            await actOnEachSelected(copy, action, selected);

            return {
              status,
              selection: repositoryState(repository, paths),
              eachFile: repositoryState(copy, paths),
            };
          });

          expect(outcome.status).toStrictEqual({ status: "applied" });
          expect(outcome.selection).toStrictEqual(outcome.eachFile);
        });
      }),
      { numRuns: 20 },
    );
  },
  timeout,
);

test("unstage the selected staged files: unstages the deletion of the file a selected one was renamed from too", async () => {
  await inRepository(async (repository) => {
    commitTenLines(repository);
    runGit(repository, ["mv", "--", "a", "b"]);
    writeFile(repository, "c", "c\n");
    runGit(repository, ["add", "--", "c"]);

    const selected = { directory: repository, group: "staged" as const, paths: ["b"] };
    const { version } = await readGroup(selected);

    await expect(applyGroup({ ...selected, operation: "unstage", version })).resolves.toStrictEqual(
      { status: "applied" },
    );

    expect(runGit(repository, ["status", "--porcelain", "--untracked-files=all"])).toBe(
      " D a\nA  c\n?? b\n",
    );
  });
});

test.each(groupActions)(
  "$operation the selected $group files: does nothing once one has left the group, or its diff has changed",
  async (action) => {
    await fc.assert(
      fc.asyncProperty(filesAndLater, async ([all, written]) => {
        const paths = all.map(({ path }) => path);

        await inRepository(async (repository) => {
          setUp(repository, all, "myers");

          const selected = { directory: repository, group: action.group, paths };
          const read = await readGroup(selected);

          writeLater(repository, written);

          const reread = await readGroup(selected);

          fc.pre(JSON.stringify(reread.files) !== JSON.stringify(read.files));

          const before = repositoryState(repository, [...paths, written.path]);

          await expect(
            applyGroup({ ...selected, version: read.version, ...action }),
          ).resolves.toStrictEqual({ status: "stale" });

          expect(repositoryState(repository, [...paths, written.path])).toStrictEqual(before);
        });
      }),
      { numRuns: 20, examples: diffChanges },
    );
  },
  timeout,
);

// Whether a file new to the repository, with the index and worktree versions, is one of the group's,
// unless git pairs it with a file that's gone, as renamed from it.
const joins: Record<GroupAction["group"], (versions: FileVersions) => boolean> = {
  modified: ({ index, worktree }) =>
    index !== undefined && (worktree === undefined || !worktree.equals(index)),
  untracked: ({ index, worktree }) => index === undefined && worktree !== undefined,
  staged: ({ index }) => index !== undefined,
};

// A few files, and a file new to the repository that often joins the group once it's written.
function filesAndJoining(group: GroupAction["group"]): fc.Arbitrary<[File[], File]> {
  return files.chain((all) =>
    fc.tuple(
      fc.constant(all),
      fc
        .record({ path: filePath, versions: fileVersions.filter(joins[group]) })
        .filter(({ path }) => canCoexist([...all.map((listed) => listed.path), path])),
    ),
  );
}

test.each(groupActions)(
  "$operation the selected $group files: acts on them once a file not selected has joined the group, and leaves it",
  async (action) => {
    await fc.assert(
      fc.asyncProperty(filesAndJoining(action.group), async ([all, joining]) => {
        const paths = all.map(({ path }) => path);

        await inRepository(async (repository) => {
          setUp(repository, all, "myers");

          const selected = { directory: repository, group: action.group, paths };
          const read = await readGroup(selected);

          writeLater(repository, joining);

          const { files: reread } = await readGroup(selected);
          const { [action.group]: listed } = await listChanges({ directory: repository });

          fc.pre(JSON.stringify(reread) === JSON.stringify(read.files));
          fc.pre(listed.includes(joining.path));

          await expect(
            applyGroup({ ...selected, version: read.version, ...action }),
          ).resolves.toStrictEqual({ status: "applied" });

          expect(worktreeFile(repository, joining.path)).toStrictEqual(joining.versions.worktree);
          const { [action.group]: after } = await listChanges({ directory: repository });

          expect(after).toContain(joining.path);
        });
      }),
      { numRuns: 20 },
    );
  },
  timeout,
);

test("reads and acts on the selected files the same through the RPCs' input and output validation", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    writeFile(repository, "b", "b\n");
    writeFile(repository, "c", "c\n");

    const input = { directory: repository, group: "untracked" as const, paths: ["c", "a"] };
    const read = await readGroup(input);

    expect(groupRpc.output.parse(await readGroup(groupRpc.input.parse(input)))).toStrictEqual(read);
    expect(read.files.map(({ path }) => path)).toStrictEqual(["a", "c"]);

    const applied = await applyGroup(
      applyGroupRpc.input.parse({ ...input, operation: "stage", version: read.version }),
    );

    expect(applyGroupRpc.output.parse(applied)).toStrictEqual({ status: "applied" });
    expect(runGit(repository, ["status", "--porcelain", "--untracked-files=all"])).toBe(
      "A  a\nA  c\n?? b\n",
    );
  });
});
