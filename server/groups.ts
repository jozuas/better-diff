import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import type { applyGroupRpc, diffRpc, groupRpc } from "../shared/diff";
import { batchedChanges, readEach } from "./batches";
import { groupsOf, readStatus } from "./changes";
import type { Entry } from "./changes";
import { collapsed, generatedPaths } from "./collapse";
import { applyChanges, changesIn, diffOf, inTurn } from "./diff";
import type { ChangedFile, Changes } from "./diff";
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

// The file, with its changes, as a diff of several read them, or else as its own diff reads them,
// or why they can't be read, which leaves the group's other files to be read: git can't open a file
// it has no permission to read, and diffs a file replaced by a directory together with what's in
// the directory.
async function readFile(
  directory: string,
  listed: readonly Entry[],
  path: string,
  group: Group,
  batched: Changes | undefined,
): Promise<GroupFile> {
  try {
    const changes = batched ?? (await changesIn(directory, listed, path, groupSides[group]));
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

// The group's files, as one git status lists them, each with the entries that list it: two for a
// file deleted from the index and untracked.
async function filesOf(directory: string, group: Group): Promise<GroupFile[]> {
  const entries = await readStatus(directory);
  const listings = new Map<string, Entry[]>(groupsOf(entries)[group].map((path) => [path, []]));

  for (const entry of entries) {
    listings.get(entry.path)?.push(entry);
  }

  const batched = await batchedChanges(directory, listings, groupSides[group]);

  const files = await readEach([...listings], async ([path, listed]) => {
    const file = await readFile(directory, listed, path, group, batched.get(path));

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

  const generated = await generatedPaths(
    directory,
    files.map(({ shown }) => shown.path),
  );

  return {
    version: groupVersionOf(files),
    files: files.map(({ shown }) =>
      "error" in shown ? shown : collapsed(shown, generated.has(shown.path)),
    ),
  };
}

export async function applyGroup({
  directory,
  group,
  operation,
  version,
}: RpcInput<typeof applyGroupRpc>): Promise<RpcOutput<typeof applyGroupRpc>> {
  const status = await inTurn(directory, async () => {
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
