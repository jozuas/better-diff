import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { applyGroupRpc } from "../shared/diff";
import { files, groupActions, addUnreadableFile, repositoryState } from "../test/groups";
import type { GroupAction, RepositoryState } from "../test/groups";
import { commitTenLines, move } from "../test/renames";
import { inCopyOf, inRepository, runGit, timeout, writeFile } from "../test/repository";
import { setUp, sides } from "../test/staging";
import { listChanges } from "./changes";
import { applyFile, readDiff } from "./diff";
import { applyGroup, readGroup } from "./groups";

// Acts on each path in turn, as its file bar would, reading its diff first.
async function actOnEach(
  repository: string,
  paths: readonly string[],
  operation: GroupAction["operation"],
): Promise<void> {
  const [path, ...rest] = paths;

  if (path !== undefined) {
    const { version } = await readDiff({ directory: repository, path, side: sides[operation] });

    await applyFile({ directory: repository, path, operation, version });
    await actOnEach(repository, rest, operation);
  }
}

// Acts on each file the group lists in turn, then on each file that joined it meanwhile, until no
// file it lists is left to act on: unstaging a renamed file leaves the deletion of the one it was
// renamed from staged.
async function actOnEachListed(
  repository: string,
  action: GroupAction,
  done: readonly string[] = [],
): Promise<void> {
  const { [action.group]: listed } = await listChanges({ directory: repository });
  const paths = listed.filter((path) => !done.includes(path));

  if (paths.length > 0) {
    await actOnEach(repository, paths, action.operation);
    await actOnEachListed(repository, action, [...done, ...paths]);
  }
}

interface Outcome {
  status: RpcOutput<typeof applyGroupRpc>;
  group: RepositoryState;
  eachFile: RepositoryState;
}

// Acts on the group, and on each of its files in a copy of the repository, and returns what acting
// on the group answers, and the state each leaves.
async function actOnGroupAndEachFile(
  repository: string,
  action: GroupAction,
  paths: readonly string[],
): Promise<Outcome> {
  const outcome = await inCopyOf(repository, async (copy) => {
    const { version } = await readGroup({ directory: repository, group: action.group });
    const status = await applyGroup({ directory: repository, version, ...action });

    await actOnEachListed(copy, action);

    return {
      status,
      group: repositoryState(repository, paths),
      eachFile: repositoryState(copy, paths),
    };
  });

  return outcome;
}

test.each(groupActions)(
  "$operation all $group files: does what doing it to each file in turn does",
  async (action) => {
    await fc.assert(
      fc.asyncProperty(files, async (all) => {
        await inRepository(async (repository) => {
          setUp(repository, all, "myers");

          const { status, group, eachFile } = await actOnGroupAndEachFile(
            repository,
            action,
            all.map(({ path }) => path),
          );

          expect(status).toStrictEqual({ status: "applied" });
          expect(group).toStrictEqual(eachFile);
        });
      }),
      { numRuns: 20 },
    );
  },
  timeout,
);

// Each sets up files whose file actions act on more than one path, or on what a patch can't change.
const twoPaths: [string, (repository: string) => void][] = [
  [
    "a file moved without git",
    (repository) => {
      commitTenLines(repository);
      move(repository);
    },
  ],
  [
    "a file moved without git, beside one added intent-to-add",
    (repository) => {
      commitTenLines(repository);
      move(repository);
      writeFile(repository, "c", "c\n");
      runGit(repository, ["add", "--intent-to-add", "--", "c"]);
    },
  ],
  [
    "a staged rename",
    (repository) => {
      commitTenLines(repository);
      runGit(repository, ["mv", "--", "a", "b"]);
    },
  ],
  [
    "a binary file",
    (repository) => {
      writeFile(repository, "a", "a\0");
      writeFile(repository, "b", "b\0");
      runGit(repository, ["add", "--", "a"]);
    },
  ],
];

test.each(
  twoPaths.flatMap(([name, write]) =>
    groupActions.map((action) => ({
      name,
      write,
      action,
      group: action.group,
      operation: action.operation,
    })),
  ),
)("$operation all $group files: $name", async ({ write, action }) => {
  await inRepository(async (repository) => {
    write(repository);

    const { status, group, eachFile } = await actOnGroupAndEachFile(repository, action, [
      "a",
      "b",
      "c",
    ]);

    expect(status).toStrictEqual({ status: "applied" });
    expect(group).toStrictEqual(eachFile);
  });
});

test("stage all untracked files: leaves one whose diff can't be read as it is", async () => {
  await inRepository(async (repository) => {
    addUnreadableFile(repository);

    const { version } = await readGroup({ directory: repository, group: "untracked" });

    await expect(
      applyGroup({ directory: repository, group: "untracked", operation: "stage", version }),
    ).resolves.toStrictEqual({ status: "applied" });

    expect(runGit(repository, ["status", "--porcelain", "--untracked-files=all", "-z"])).toBe(
      "A  b\0?? a\0",
    );
  });
});
