import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import type { applyGroupRpc, diffRpc, groupRpc } from "../shared/diff";
import { groupsOf, readStatus } from "./changes";
import { applyChanges, changesIn, diffOf, inTurn, versionOf } from "./diff";
import type { ChangedFile } from "./diff";

type Group = RpcInput<typeof groupRpc>["group"];

// The diff each group's files are shown with.
const groupSides: Record<Group, RpcInput<typeof diffRpc>["side"]> = {
  modified: "unstaged",
  untracked: "unstaged",
  staged: "staged",
};

// Reads each item, a few at a time: a group can have hundreds of files, each read by git commands
// of its own.
async function readInBatches<T, R>(
  items: readonly T[],
  read: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const batch = await Promise.all(items.slice(0, 8).map(read));
  const rest = await readInBatches(items.slice(8), read);

  return [...batch, ...rest];
}

// The group's files, with their changes, as one git status lists them.
async function filesOf(directory: string, group: Group): Promise<ChangedFile[]> {
  const entries = await readStatus(directory);

  const files = await readInBatches(groupsOf(entries)[group], async (path) => {
    const changes = await changesIn(directory, entries, path, groupSides[group]);

    return { path, changes };
  });

  return files;
}

function groupVersionOf(files: readonly ChangedFile[]): string {
  const versions = files.map(({ path, changes }) => [path, versionOf(changes.diff)]);

  return versionOf(Buffer.from(JSON.stringify(versions)));
}

export async function readGroup({
  directory,
  group,
}: RpcInput<typeof groupRpc>): Promise<RpcOutput<typeof groupRpc>> {
  const files = await filesOf(directory, group);

  return {
    version: groupVersionOf(files),
    files: files.map(({ path, changes }) => Object.assign(diffOf(changes), { path })),
  };
}

export async function applyGroup({
  directory,
  group,
  operation,
  version,
}: RpcInput<typeof applyGroupRpc>): Promise<RpcOutput<typeof applyGroupRpc>> {
  const status = await inTurn(async () => {
    const files = await filesOf(directory, group);

    if (groupVersionOf(files) !== version) {
      return { status: "stale" };
    }

    await applyChanges(directory, operation, files);

    return { status: "applied" };
  });

  return status;
}
