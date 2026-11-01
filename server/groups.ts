import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import type { applyGroupRpc, diffRpc, groupRpc } from "../shared/diff";
import { groupsOf, readStatus } from "./changes";
import type { Entry } from "./changes";
import { applyChanges, changesIn, diffOf, inTurn } from "./diff";
import type { ChangedFile } from "./diff";
import { versionOf } from "./version";

type Group = RpcInput<typeof groupRpc>["group"];

// The diff each group's files are shown with.
const groupSides: Record<Group, RpcInput<typeof diffRpc>["side"]> = {
  modified: "unstaged",
  untracked: "unstaged",
  staged: "staged",
};

interface GroupFile {
  shown: RpcOutput<typeof groupRpc>["files"][number];
  // The diff's version, or why the diff can't be read.
  version: string;
  // Undefined where the changes can't be read.
  changed: ChangedFile | undefined;
}

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

// The file, with its changes, or why they can't be read, which leaves the group's other files to be
// read: git can't open a file it has no permission to read, and diffs a file replaced by a
// directory together with what's in the directory.
async function readFile(
  directory: string,
  entries: readonly Entry[],
  path: string,
  group: Group,
): Promise<GroupFile> {
  try {
    const changes = await changesIn(directory, entries, path, groupSides[group]);
    const diff = diffOf(changes);

    return {
      shown: Object.assign(diff, { path }),
      version: diff.version,
      changed: { path, changes },
    };
  } catch (error) {
    const reason = String(error);

    return { shown: { path, error: reason }, version: reason, changed: undefined };
  }
}

// The group's files, as one git status lists them.
async function filesOf(directory: string, group: Group): Promise<GroupFile[]> {
  const entries = await readStatus(directory);

  const files = await readInBatches(groupsOf(entries)[group], async (path) => {
    const file = await readFile(directory, entries, path, group);

    return file;
  });

  return files;
}

function groupVersionOf(files: readonly GroupFile[]): string {
  return versionOf(JSON.stringify(files.map(({ shown, version }) => [shown.path, version])));
}

export async function readGroup({
  directory,
  group,
}: RpcInput<typeof groupRpc>): Promise<RpcOutput<typeof groupRpc>> {
  const files = await filesOf(directory, group);

  return { version: groupVersionOf(files), files: files.map(({ shown }) => shown) };
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

    await applyChanges(
      directory,
      operation,
      files.flatMap(({ changed }) => changed ?? []),
    );

    return { status: "applied" };
  });

  return status;
}
