import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { applyGroupRpc } from "../shared/diff";
import {
  actOnEachListed,
  addUnreadableFile,
  files,
  groupActions,
  repositoryState,
} from "../test/groups";
import type { GroupAction, RepositoryState } from "../test/groups";
import { commitTenLines, move } from "../test/renames";
import { inCopyOf, inRepository, runGit, timeout, writeFile } from "../test/repository";
import { setUp } from "../test/staging";
import { applyGroup, readGroup } from "./groups";

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
