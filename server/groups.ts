import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import type { applyGroupRpc, groupRpc } from "../shared/diff";
import { batchedChanges, readEach } from "./batches";
import { readStatus } from "./changes";
import type { Entry } from "./changes";
import { collapsed, generatedPaths } from "./collapse";
import { applyChanges, diffOf, inTurn } from "./diff";
import type { ChangedFile } from "./diff";
import { changesIn } from "./file-changes";
import type { Changes } from "./file-changes";
import { groupSides, groupsOf } from "./grouping";
import { highlightedTogether } from "./highlight";
import type { UnhighlightedDiff } from "./highlight";
import { others, readOtherChanges, reviewIn, withOtherChanges } from "./review";

type Group = RpcInput<typeof groupRpc>["group"];

type GroupFile =
  // With the entries git status listed the file in, which its changes were read by.
  | { shown: UnhighlightedDiff & { path: string }; changed: ChangedFile; listed: readonly Entry[] }
  // Where the changes can't be read.
  | { shown: { path: string; error: string }; changed: undefined };

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
  hideWhitespace: boolean | undefined,
): Promise<GroupFile> {
  try {
    const changes =
      batched ?? (await changesIn(directory, listed, path, groupSides[group], hideWhitespace));

    const diff = diffOf(changes);

    return { shown: Object.assign(diff, { path }), changed: { path, changes }, listed };
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

// The files at the paths, each with the entries git status lists it in: two for a file deleted from
// the index and untracked.
function listingsOf(entries: readonly Entry[], read: readonly string[]): Map<string, Entry[]> {
  const listings = new Map<string, Entry[]>(read.map((path) => [path, []]));

  for (const entry of entries) {
    listings.get(entry.path)?.push(entry);
  }

  return listings;
}

// The group's files, as git status lists them, each by the entries that list it, with whitespace
// changes hidden where they're to be hidden.
async function filesOf(
  directory: string,
  listings: ReadonlyMap<string, readonly Entry[]>,
  group: Group,
  hideWhitespace?: boolean,
): Promise<GroupFile[]> {
  const batched = await batchedChanges(directory, listings, groupSides[group], hideWhitespace);

  const files = await readEach([...listings], async ([path, listed]) => {
    const file = await readFile(directory, listed, path, group, batched.get(path), hideWhitespace);

    return file;
  });

  return files;
}

// The changes on the other side from the group's of each of its files that has some there, as git
// status lists them, as a diff of several reads them, or else as its own diff reads them, by path,
// or null where they can't be read. A file with none there has none.
async function otherChangesOf(
  directory: string,
  listings: ReadonlyMap<string, readonly Entry[]>,
  group: Group,
  hideWhitespace: boolean | undefined,
): Promise<Map<string, Changes | null>> {
  const side = groupSides[group];
  const changed = withOtherChanges(listings, side);
  const batched = await batchedChanges(directory, changed, others[side], hideWhitespace);

  const read = await readEach([...changed], async ([path, listed]) => {
    const changes =
      batched.get(path) ?? (await readOtherChanges(directory, listed, path, side, hideWhitespace));

    return [path, changes] as const;
  });

  return new Map(read);
}

export async function readGroup({
  directory,
  group,
  paths,
  hideWhitespace,
}: RpcInput<typeof groupRpc>): Promise<RpcOutput<typeof groupRpc>> {
  const entries = await readStatus(directory);
  const listings = listingsOf(entries, groupPaths(entries, group, paths));

  const [files, otherSides] = await Promise.all([
    filesOf(directory, listings, group, hideWhitespace),
    otherChangesOf(directory, listings, group, hideWhitespace),
  ]);

  const generated = await generatedPaths(
    directory,
    files.map(({ shown }) => shown.path),
  );

  const shown = await highlightedTogether((highlight) =>
    files.map(async (groupFile) => {
      if (groupFile.changed === undefined) {
        return groupFile.shown;
      }

      const { shown: file, changed, listed } = groupFile;
      const other = otherSides.get(changed.path);
      const review = reviewIn(groupSides[group], listed, changed.changes, other);
      const reviewed = review === undefined ? file : { ...file, review };
      const read = await highlight(collapsed(reviewed, generated.has(file.path)), file.path, false);

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
      return { status: "stale" } as const;
    }

    const files = await filesOf(directory, listingsOf(entries, read), group);

    await applyChanges(
      directory,
      operation,
      files.flatMap(({ changed }) => changed ?? []),
    );

    return { status: "applied" } as const;
  });

  return status;
}
