import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";
import { backward, forward } from "../shared/versions";
import type { NumberedLine } from "./lines";
import type { Side } from "./side-by-side";

type Diff = RpcOutput<typeof diffRpc>;

// A file's diff, as a group shows it: unstaged, from the index to the worktree, or staged, from HEAD
// to the index.
export interface CommentedFile {
  diff: "unstaged" | "staged";
  path: string;
}

// Tells a file's diff apart from others.
export function fileKey({ diff, path }: CommentedFile): string {
  return JSON.stringify([diff, path]);
}

// The line's number in the side's version, if it's in it.
export function numberIn(line: NumberedLine, side: Side): number | undefined {
  return side === "old" ? line.oldNumber : line.newNumber;
}

// The other diff of the file: the staged one of an unstaged diff's, and the unstaged one of a staged
// diff's.
function otherOf({ diff, path }: CommentedFile): CommentedFile {
  return { diff: diff === "unstaged" ? "staged" : "unstaged", path };
}

// What a line's number on a side of a diff is in the version the review has on that side, by the
// file's other diff, or undefined where that version doesn't have the line.
export type Numbering = Record<Side, (number: number) => number | undefined>;

function same(number: number): number {
  return number;
}

// How the lines of a file whose diffs change nothing of each other's versions are numbered in the
// review: as the diffs number them.
const asNumbered: Numbering = { old: same, new: same };

// How the lines of the diff, unstaged or staged, are numbered in the review, which is of the
// worktree's uncommitted changes, as Paseo's own diff's is: from HEAD, on the old side, to the
// worktree, on the new one. An unstaged diff goes from the index, and a staged one to it, and a line
// of the index is numbered as it is in HEAD, or in the worktree, by the file's other diff, unless
// that diff adds it, or removes it.
export function numberingOf(diff: CommentedFile["diff"], other: Pick<Diff, "hunks">): Numbering {
  return diff === "unstaged"
    ? { old: (number) => backward(other.hunks, number), new: same }
    : { old: same, new: (number) => forward(other.hunks, number) };
}

// The line's number on the side as the review numbers it, if the side's version has it.
export function numbered(line: NumberedLine, side: Side, numbering: Numbering): number | undefined {
  const number = numberIn(line, side);

  return number === undefined ? undefined : numbering[side](number);
}

// How the review numbers the lines of each file's diff, by the files partly staged, which both
// MODIFIED and STAGED list, while the groups are listed, and their diffs as read, if they are: a
// partly staged file's by its other diff, once that's read, and any other's as its diffs number
// them, as its other diff changes nothing. The same each time for a file's diff, so that what's
// rendered with it isn't rendered again.
export function numberings(
  partly: readonly string[] | undefined,
  diffOf: (file: CommentedFile) => Pick<Diff, "hunks"> | undefined,
): (file: CommentedFile) => Numbering | undefined {
  const known = new Map<string, Numbering>();

  return (file: CommentedFile): Numbering | undefined => {
    if (partly === undefined) {
      return undefined;
    }

    if (!partly.includes(file.path)) {
      return asNumbered;
    }

    const other = diffOf(otherOf(file));
    const key = fileKey(file);

    if (other !== undefined && !known.has(key)) {
      known.set(key, numberingOf(file.diff, other));
    }

    return known.get(key);
  };
}
