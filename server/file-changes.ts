import type { RpcInput } from "@getpaseo/plugin";

import type { RepositoryKind, diffRpc } from "../shared/diff";
import { aloneIntentToAdd, readStatus, withIntentToAdd } from "./changes";
import type { Entry } from "./changes";
import { git } from "./git";
import { repositoryOn } from "./grouping";
import { isRename } from "./patch";
import { symlinksAmong } from "./symlinks";
import { versionOf } from "./version";

export type Side = RpcInput<typeof diffRpc>["side"];

export const diffOptions: Record<Side, string[]> = { unstaged: [], staged: ["--cached"] };

// Hides changes only to whitespace, as lazygit's toggle hides them.
export const ignoringWhitespace = ["--ignore-all-space"];

export interface Changes {
  diff: Buffer;
  // The diff with whitespace changes hidden, where they're hidden. git prints nothing for a file
  // whose changes are all to whitespace, unless it's renamed or its mode changed.
  withoutWhitespace?: Buffer;
  renamedFrom: string | undefined;
  // What the diff covers: the file, and a renamed one's original path.
  paths: string[];
  // Whether the file isn't in the index, or is there intent-to-add.
  untracked: boolean;
  intentToAdd: boolean;
  // Where it's a submodule, or a repository inside the worktree, what its diff is of.
  repository: RepositoryKind | undefined;
}

// An untracked file's diff as a new file, as git diffs one added with --intent-to-add. `git diff
// --no-index` reads a file named `-` from its input, and `git apply` refuses one spelled `./-`, so
// that one is diffed intent-to-add, in an index of its own. So is a symlink: where it points to a
// directory, `git diff --no-index` goes into the directory for a file `null` to diff /dev/null with,
// and fails as it does where the files differ.
async function newFileDiff(directory: string, path: string): Promise<Buffer> {
  const symlinks = await symlinksAmong(directory, [path]);

  const diff =
    path === "-" || symlinks.has(path)
      ? await aloneIntentToAdd(directory, [path], async (index) => {
          // Stryker disable next-line ArrayDeclaration: the index has only the file, so git diffs it alone either way.
          const added = await git(directory, "diff", [], [path], { index });

          return added;
        })
      : await git(directory, "diff", ["--no-index"], ["/dev/null", path]);

  return diff;
}

// A file's own diff on the side. `git diff` leaves an untracked file out, though its changes are
// all of its lines, so it's diffed as a new file.
async function ownDiff(
  directory: string,
  path: string,
  side: Side,
  untracked: boolean,
): Promise<Buffer> {
  const diff = untracked
    ? await newFileDiff(directory, path)
    : await git(directory, "diff", diffOptions[side], [path]);

  return diff;
}

// The diff of a renamed file's two paths, which shows the rename, where one of either path shows a
// deletion or a new file. An untracked file is diffed intent-to-add, as git status found the
// rename. There's no rename to diff where git status named the path a file was copied from, or
// renamed from on the other side, or where the files changed after git status paired them, so git
// no longer pairs them, or won't add a file that's gone.
async function renameDiff(
  directory: string,
  paths: readonly [string, string],
  side: Side,
  untracked: boolean,
): Promise<Buffer | undefined> {
  const diff = untracked
    ? await withIntentToAdd(directory, [paths[1]], async (index) => {
        const renamed = await git(directory, "diff", [], paths, { index });

        return renamed;
      }).catch(() => Buffer.alloc(0))
    : await git(directory, "diff", diffOptions[side], paths);

  return isRename(diff) ? diff : undefined;
}

// How the entries git status lists a file in say its changes on a side are read. A file listed
// twice, as deleted from the index and untracked, isn't renamed.
export interface Listing {
  // The path git status names as the one the file was renamed or copied from.
  original: string | undefined;
  untracked: boolean;
  intentToAdd: boolean;
  repository: RepositoryKind | undefined;
}

export function listingOf(listed: readonly Entry[], side: Side): Listing {
  const untracked = side === "unstaged" && listed.some((entry) => entry.untracked);
  // The entry of the file the side shows: on the unstaged side, the untracked one, where git status
  // lists a file twice, as deleted from the index and untracked.
  const shown = listed.find((entry) => entry.untracked === untracked);

  return {
    original: listed[0]?.original,
    untracked,
    intentToAdd: listed[0]?.intentToAdd === true,
    repository: shown === undefined ? undefined : repositoryOn(shown, side),
  };
}

// The file's changes, as its diff makes them: a rename where it renames the file from a path.
export function changesFrom(
  diff: Buffer,
  path: string,
  renamedFrom: string | undefined,
  { untracked, intentToAdd, repository }: Listing,
): Changes {
  return {
    diff,
    renamedFrom,
    paths: renamedFrom === undefined ? [path] : [renamedFrom, path],
    untracked,
    intentToAdd,
    repository,
  };
}

// The changes' diff with whitespace changes hidden, read as their diff was: of the same paths, with
// an untracked file that's renamed intent-to-add. An untracked file that isn't renamed is new, and
// all of its diff shows.
async function diffWithoutWhitespace(
  directory: string,
  path: string,
  { diff, renamedFrom, paths, untracked }: Changes,
  side: Side,
): Promise<Buffer> {
  if (!untracked) {
    const hidden = await git(
      directory,
      "diff",
      [...diffOptions[side], ...ignoringWhitespace],
      paths,
    );

    return hidden;
  }

  if (renamedFrom === undefined) {
    return diff;
  }

  const moved = await withIntentToAdd(directory, [path], async (index) => {
    const hidden = await git(directory, "diff", ignoringWhitespace, paths, { index });

    return hidden;
  });

  return moved;
}

// The changes, with their diff with whitespace changes hidden where they're to be hidden.
async function hiding(
  directory: string,
  path: string,
  changes: Changes,
  side: Side,
  hideWhitespace: boolean | undefined,
): Promise<Changes> {
  if (hideWhitespace !== true) {
    return changes;
  }

  const withoutWhitespace = await diffWithoutWhitespace(directory, path, changes, side);

  return { ...changes, withoutWhitespace };
}

// The file's changes on the side, as git status lists it.
async function listedChanges(
  directory: string,
  listing: Listing,
  path: string,
  side: Side,
): Promise<Changes> {
  const { original, untracked } = listing;

  if (original !== undefined) {
    const renamed = await renameDiff(directory, [original, path], side, untracked);

    if (renamed !== undefined) {
      return changesFrom(renamed, path, original, listing);
    }
  }

  const diff = await ownDiff(directory, path, side, untracked);

  return changesFrom(diff, path, undefined, listing);
}

// The file's changes on the side, as the entries git status lists it in say, and their diff with
// whitespace changes hidden where they're to be hidden. A submodule's are what git diffs where its
// path is named as a submodule's: its change of commit, which `git add` stages, or where its files
// alone changed, that it's dirty, which `git add` leaves as it is. A repository inside the worktree
// that isn't a submodule has none.
export async function changesIn(
  directory: string,
  listed: readonly Entry[],
  path: string,
  side: Side,
  hideWhitespace?: boolean,
): Promise<Changes> {
  const listing = listingOf(listed, side);

  if (listing.repository !== undefined) {
    const diff = await git(directory, "diff", diffOptions[side], [path], { submodules: [path] });

    return changesFrom(diff, path, undefined, listing);
  }

  const changes = await listedChanges(directory, listing, path, side);
  const shown = await hiding(directory, path, changes, side, hideWhitespace);

  return shown;
}

export async function changesOf(
  directory: string,
  path: string,
  side: Side,
  hideWhitespace: boolean | undefined,
): Promise<Changes> {
  const entries = await readStatus(directory);

  const changes = await changesIn(
    directory,
    entries.filter((entry) => entry.path === path),
    path,
    side,
    hideWhitespace,
  );

  return changes;
}

// Changes whenever the changes' diff does, and where whitespace changes are hidden, whenever the
// diff that hides them does, where an action on lines finds them.
export function versionOfChanges({ diff, withoutWhitespace }: Changes): string {
  return withoutWhitespace === undefined
    ? versionOf(diff)
    : versionOf(`${versionOf(diff)} ${versionOf(withoutWhitespace)}`);
}
