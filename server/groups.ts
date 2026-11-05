import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import type { applyGroupRpc, diffRpc, groupRpc } from "../shared/diff";
import { batchedChanges, readEach } from "./batches";
import { groupsOf, readStatus } from "./changes";
import type { Entry } from "./changes";
import { collapsed, generatedPaths } from "./collapse";
import { applyChanges, changesIn, diffOf, inTurn } from "./diff";
import type { ChangedFile, Changes } from "./diff";
import { highlighted } from "./highlight";
import type { UnhighlightedDiff } from "./highlight";

type Group = RpcInput<typeof groupRpc>["group"];

// The diff each group's files are shown with.
const groupSides: Record<Group, RpcInput<typeof diffRpc>["side"]> = {
  modified: "unstaged",
  untracked: "unstaged",
  staged: "staged",
};

interface GroupFile {
  shown: (UnhighlightedDiff & { path: string }) | { path: string; error: string };
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

    return { shown: Object.assign(diff, { path }), changed: { path, changes } };
  } catch (error) {
    return { shown: { path, error: String(error) }, changed: undefined };
  }
}

// The group's files, or those of them at the paths, in the order git status lists them.
function groupPaths(
  entries: readonly Entry[],
  group: Group,
  paths: readonly string[] | undefined,
): string[] {
  const { [group]: grouped } = groupsOf(entries);

  if (paths === undefined) {
    return grouped;
  }

  const wanted = new Set(paths);

  return grouped.filter((path) => wanted.has(path));
}

// The group's files at the paths, as git status lists them, each with the entries that list it:
// two for a file deleted from the index and untracked.
async function filesOf(
  directory: string,
  entries: readonly Entry[],
  group: Group,
  read: readonly string[],
): Promise<GroupFile[]> {
  const listings = new Map<string, Entry[]>(read.map((path) => [path, []]));

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

export async function readGroup({
  directory,
  group,
  paths,
}: RpcInput<typeof groupRpc>): Promise<RpcOutput<typeof groupRpc>> {
  const entries = await readStatus(directory);
  const files = await filesOf(directory, entries, group, groupPaths(entries, group, paths));

  const generated = await generatedPaths(
    directory,
    files.map(({ shown }) => shown.path),
  );

  const shown = await Promise.all(
    files.map(async ({ shown: file }) => {
      if ("error" in file) {
        return file;
      }

      const read = await highlighted(collapsed(file, generated.has(file.path)), file.path, false);

      return read;
    }),
  );

  return { files: shown };
}

export async function applyGroup({
  directory,
  group,
  operation,
  paths,
  selected,
}: RpcInput<typeof applyGroupRpc>): Promise<RpcOutput<typeof applyGroupRpc>> {
  const status = await inTurn(directory, async () => {
    const entries = await readStatus(directory);
    const read = groupPaths(entries, group, selected === true ? paths : undefined);
    const listed = new Set(paths);

    if (read.length !== listed.size || read.some((path) => !listed.has(path))) {
      return { status: "stale" };
    }

    const files = await filesOf(directory, entries, group, read);

    await applyChanges(
      directory,
      operation,
      files.flatMap(({ changed }) => changed ?? []),
    );

    return { status: "applied" };
  });

  return status;
}
