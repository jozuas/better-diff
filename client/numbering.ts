import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";
import { backward, forward } from "../shared/versions";
import type { Hunk } from "../shared/versions";
import type { NumberedFile } from "./comments";
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

// What a line's number on a side of a diff is in the version the review has on that side, by the
// file's other diff, or undefined where that version doesn't have the line.
export type Numbering = Record<Side, (number: number) => number | undefined>;

function same(number: number): number {
  return number;
}

// How the lines of the diff, unstaged or staged, are numbered in the review, which is of the
// worktree's uncommitted changes, as Paseo's own diff's is: from HEAD, on the old side, to the
// worktree, on the new one. An unstaged diff goes from the index, and a staged one to it, and a line
// of the index is numbered as it is in HEAD, or in the worktree, by the hunks of the file's other
// diff, unless that diff adds it, or removes it.
function numberingOf(diff: CommentedFile["diff"], other: readonly Hunk[]): Numbering {
  return diff === "unstaged"
    ? { old: (number) => backward(other, number), new: same }
    : { old: same, new: (number) => forward(other, number) };
}

// The line's number on the side as the review numbers it, if the side's version has it.
export function numbered(line: NumberedLine, side: Side, numbering: Numbering): number | undefined {
  const number = numberIn(line, side);

  return number === undefined ? undefined : numbering[side](number);
}

// The file of the diff, with how the review numbers the diff's lines, by what it was read with, if
// it was.
export function reviewedFile(
  file: CommentedFile,
  { review }: Pick<Diff, "review">,
): NumberedFile | undefined {
  return review === undefined
    ? undefined
    : { path: file.path, numbering: numberingOf(file.diff, review.other) };
}
