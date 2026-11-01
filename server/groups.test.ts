import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import { applyGroupRpc, groupRpc } from "../shared/diff";
import {
  diffChanges,
  files,
  filesAndLater,
  groupActions,
  addUnreadableFile,
  repositoryState,
  writeLater,
} from "../test/groups";
import type { GroupAction } from "../test/groups";
import { inRepository, timeout, writeFile } from "../test/repository";
import { setUp } from "../test/staging";
import { listChanges } from "./changes";
import { readDiff } from "./diff";
import { applyGroup, readGroup } from "./groups";

const groups = ["modified", "untracked", "staged"] as const;

type Group = (typeof groups)[number];

// The diff each group's files are shown with.
const groupSides = { modified: "unstaged", untracked: "unstaged", staged: "staged" } as const;

// Each file changes.list lists in the group, with its diff as diff.read reads it, or the error
// diff.read fails with.
async function eachFile(
  repository: string,
  group: Group,
): Promise<RpcOutput<typeof groupRpc>["files"]> {
  const { [group]: paths } = await listChanges({ directory: repository });

  const diffs = await Promise.all(
    paths.map(async (path) => {
      try {
        const diff = await readDiff({ directory: repository, path, side: groupSides[group] });

        return Object.assign(diff, { path });
      } catch (error) {
        return { path, error: String(error) };
      }
    }),
  );

  return diffs;
}

test.each(groups)(
  "reads each %s file as changes.list lists it and diff.read reads it",
  async (group) => {
    await fc.assert(
      fc.asyncProperty(files, async (all) => {
        await inRepository(async (repository) => {
          setUp(repository, all, "myers");

          const { files: read } = await readGroup({ directory: repository, group });

          expect(read).toStrictEqual(await eachFile(repository, group));
        });
      }),
      { numRuns: 20 },
    );
  },
  timeout,
);

test("reads a group of more files than it reads at once", async () => {
  await inRepository(async (repository) => {
    for (const number of Array.from({ length: 20 }, (_, index) => index)) {
      writeFile(repository, String(number), `${number}\n`);
    }

    const { files: read } = await readGroup({ directory: repository, group: "untracked" });

    expect(read).toStrictEqual(await eachFile(repository, "untracked"));
  });
});

test("reads the other files of a group with one whose diff can't be read, which has why", async () => {
  await inRepository(async (repository) => {
    addUnreadableFile(repository);

    const answer = await readGroup({ directory: repository, group: "untracked" });
    const { files: read } = answer;

    expect(groupRpc.output.parse(answer)).toStrictEqual(answer);
    expect(read).toStrictEqual(await eachFile(repository, "untracked"));

    expect(read.map(({ path }) => path)).toStrictEqual(["a", "b"]);

    expect(read[0]).toStrictEqual({
      path: "a",
      error: 'Error: git diff failed: error: open("a"): Permission denied\nfatal: cannot hash a\n',
    });
  });
});

test.each(groupActions)(
  "$operation all $group files: does nothing once a file has joined or left the group, or its diff has changed",
  async (action) => {
    await fc.assert(
      fc.asyncProperty(filesAndLater, async ([all, written]) => {
        const paths = all.map(({ path }) => path);

        await inRepository(async (repository) => {
          setUp(repository, all, "myers");

          const read = await readGroup({ directory: repository, group: action.group });

          writeLater(repository, written);

          const reread = await readGroup({ directory: repository, group: action.group });

          fc.pre(JSON.stringify(reread.files) !== JSON.stringify(read.files));

          const before = repositoryState(repository, [...paths, written.path]);

          await expect(
            applyGroup({ directory: repository, version: read.version, ...action }),
          ).resolves.toStrictEqual({ status: "stale" });

          expect(repositoryState(repository, [...paths, written.path])).toStrictEqual(before);
        });
      }),
      { numRuns: 20, examples: diffChanges },
    );
  },
  timeout,
);

test.each(groupActions)(
  "$operation all $group files: answers the same through the RPCs' input and output validation",
  async (action: GroupAction) => {
    await inRepository(async (repository) => {
      setUp(
        repository,
        [
          {
            path: "a",
            versions: {
              head: Buffer.from("a\n"),
              index: Buffer.from("b\n"),
              worktree: Buffer.from("c\n"),
            },
          },
          {
            path: "b",
            versions: { head: undefined, index: undefined, worktree: Buffer.from("b\n") },
          },
        ],
        "myers",
      );

      const input = { directory: repository, group: action.group };
      const read = await readGroup(input);

      expect(groupRpc.output.parse(await readGroup(groupRpc.input.parse(input)))).toStrictEqual(
        read,
      );

      const applied = await applyGroup(
        applyGroupRpc.input.parse({ directory: repository, version: read.version, ...action }),
      );

      expect(applyGroupRpc.output.parse(applied)).toStrictEqual({ status: "applied" });
      expect(read.files).toHaveLength(1);
    });
  },
);

test.each([
  { group: "modified", operation: "unstage" },
  { group: "untracked", operation: "unstage" },
  { group: "staged", operation: "stage" },
  { group: "staged", operation: "discard" },
])("refuses to $operation all $group files", ({ group, operation }) => {
  const parsed = applyGroupRpc.input.safeParse({ directory: "/", version: "", group, operation });

  expect(parsed.success).toBe(false);
});
