import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";
import type { Entry } from "./changes";
import { changesIn, shownDiffOf } from "./file-changes";
import type { Changes, Side } from "./file-changes";
import { groupSides, groupsOf } from "./grouping";
import { blobOf } from "./index-blob";
import { parseDiff } from "./patch";

type Review = NonNullable<RpcOutput<typeof diffRpc>["review"]>;

// The side of a file's changes other than each side, which numbers the lines of the index in HEAD
// or the worktree.
export const others: Readonly<Record<Side, Side>> = { unstaged: "staged", staged: "unstaged" };

// Whether the file git status lists in the entries, which the side's groups list, has changes on
// the other side too, as a partly staged file has: whether that side's groups list it too. Its diff
// there would be empty otherwise, as no change there is, though that takes another git command.
function changedOnOtherSide(listed: readonly Entry[], side: Side): boolean {
  const groups = groupsOf(listed);

  return (["modified", "untracked", "staged"] as const).some(
    (group) => groupSides[group] === others[side] && groups[group].length > 0,
  );
}

// Of the files, each with the entries git status lists it in, those with changes on the other side
// from the side, as changedOnOtherSide has it, whose changes there are read.
export function withOtherChanges(
  listings: ReadonlyMap<string, readonly Entry[]>,
  side: Side,
): Map<string, readonly Entry[]> {
  return new Map([...listings].filter(([, listed]) => changedOnOtherSide(listed, side)));
}

// The file's changes on the other side from the side, as the entries git status lists it in say, or
// null where they can't be read.
export async function readOtherChanges(
  directory: string,
  listed: readonly Entry[],
  path: string,
  side: Side,
  hideWhitespace?: boolean,
): Promise<Changes | null> {
  try {
    const changes = await changesIn(directory, listed, path, others[side], hideWhitespace);

    return changes;
  } catch {
    return null;
  }
}

// The file's changes on the other side from the side, as readOtherChanges reads them, if it has any
// there, and undefined where it has none.
export async function otherChanges(
  directory: string,
  listed: readonly Entry[],
  path: string,
  side: Side,
  hideWhitespace?: boolean,
): Promise<Changes | undefined | null> {
  if (!changedOnOtherSide(listed, side)) {
    return undefined;
  }

  const changes = await readOtherChanges(directory, listed, path, side, hideWhitespace);

  return changes;
}

// Which side of each side's diff the index is on: the unstaged diff goes from it, and the staged
// diff to it.
const indexSides = { unstaged: "old", staged: "new" } as const;

// Whether the ids name the same blob, as far as each goes: git status names a blob in full, and a
// diff as git abbreviates it.
function sameBlob(id: string, other: string): boolean {
  return id.startsWith(other) || other.startsWith(id);
}

// Whether the diff of a file's changes on the side, as shown, and the one of its changes on the
// other, if it has any there, were read of the lines of the index git status listed the file with:
// whether the blobs named for the index are all the same, the one git status names in the entries
// it lists the file in, and the one each diff names, of those that name one. git status names none
// for an untracked file, and a diff that names none changes none of its lines.
function sameIndex(
  side: Side,
  listed: readonly Entry[],
  own: Changes,
  other: Changes | undefined,
): boolean {
  const named = [
    ...listed.map(({ indexBlob }) => indexBlob),
    blobOf(shownDiffOf(own), indexSides[side]),
    other === undefined ? undefined : blobOf(shownDiffOf(other), indexSides[others[side]]),
  ].flatMap((blob) => blob ?? []);

  return named.every((blob) => named.every((each) => sameBlob(blob, each)));
}

// Whether the file's changes on the side, and those on the other, if any, were read of other lines
// of the index than git status listed the file with, in the entries, as while another program
// stages and unstages, so that reading them again may read them of the same. Not where the other's
// can't be read, which reading them again doesn't change.
export function indexChanged(
  side: Side,
  listed: readonly Entry[],
  own: Changes,
  other: Changes | undefined | null,
): boolean {
  return other !== null && !sameIndex(side, listed, own, other);
}

// How the review numbers the lines of the diff of the file's changes on the side, as shown: by the
// hunks of the diff of its changes on the other, as shown, if any. Undefined where they weren't read
// of the lines of the index git status listed the file with, in the entries, or the other's can't be
// parsed.
function reviewOf(
  side: Side,
  listed: readonly Entry[],
  own: Changes,
  other: Changes | undefined,
): Review | undefined {
  if (!sameIndex(side, listed, own, other)) {
    return undefined;
  }

  if (other === undefined) {
    return { other: [] };
  }

  try {
    const { hunks } = parseDiff(shownDiffOf(other));

    return {
      other: hunks.map(({ oldStart, newStart, lines }) => ({
        oldStart,
        newStart,
        lines: lines.map(({ kind }) => ({ kind })),
      })),
    };
  }
  // Stryker disable next-line BlockStatement: an empty catch has it return undefined all the same.
  catch {
    return undefined;
  }
}

// How the review numbers the lines of the diff of the file's changes on the side, as reviewOf has it,
// by the entries git status listed the file in, which its changes were read by, and its changes on
// the other, if any, unless those can't be read.
export function reviewIn(
  side: Side,
  listed: readonly Entry[],
  own: Changes,
  other: Changes | undefined | null,
): Review | undefined {
  return other === null ? undefined : reviewOf(side, listed, own, other);
}
