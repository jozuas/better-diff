import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";
import { placementOf } from "./attachment";
import type { Unsent } from "./attachment";
import type { ReviewComment } from "./comments";
import type { GroupName, OpenFile } from "./groups";
import type { NumberedLine } from "./lines";
import { numberIn } from "./numbering";
import type { CommentedFile } from "./numbering";

type Diff = RpcOutput<typeof diffRpc>;

// A pending comment's line, as one of its file's diffs has it: the line, and the diff.
interface PlacedLine {
  line: NumberedLine;
  diff: CommentedFile["diff"];
}

// Where a pending comment's line is in its file's diffs as read now: as one has it, or that neither
// has it, or that they aren't read yet, or can't be.
export type Placed = PlacedLine | Unsent;

// The comment's line as one of its file's diffs has it, if one does.
export function placedLine(placed: Placed): PlacedLine | undefined {
  return placed === "gone" || placed === "unread" ? undefined : placed;
}

export interface ListedComment {
  comment: ReviewComment;
  placed: Placed;
}

export interface ListedFile {
  path: string;
  comments: ListedComment[];
}

// Where a comment comes in its file's list: by the diff its line is in, unstaged before staged, its
// line's hunk and its place in the hunk, or after all of them where neither diff has the line, or
// they aren't read.
type Order = [number, number, number];

// A comment as listed, and where it comes in its file's list.
interface Placing {
  listed: ListedComment;
  order: Order;
}

const diffOrder = { unstaged: 0, staged: 1 };

function placing(diffOf: DiffOf, comment: ReviewComment): Placing {
  const placement = placementOf(comment, diffOf);
  const { located } = placement;

  if (located === undefined) {
    return { listed: { comment, placed: placement.unsent }, order: [2, 0, 0] };
  }

  return {
    listed: { comment, placed: { line: located.line, diff: located.diff } },
    order: [diffOrder[located.diff], located.index, located.at],
  };
}

function byOrder(
  { order: [diff, hunk, at] }: Placing,
  { order: [otherDiff, otherHunk, otherAt] }: Placing,
): number {
  if (diff !== otherDiff) {
    return diff - otherDiff;
  }

  return hunk === otherHunk ? at - otherAt : hunk - otherHunk;
}

// Each by path.
function byPath({ path }: { path: string }, { path: other }: { path: string }): number {
  // Stryker disable next-line EqualityOperator: no two files listed have the same path.
  return path < other ? -1 : 1;
}

// The diff of a file, as read now, if it is.
type DiffOf = (file: CommentedFile) => Pick<Diff, "hunks"> | undefined;

// The comments pending, by the file each is on, with where each one's line is in the file's diffs,
// as read now, if they are: each file by path, and each file's comments in the order of their lines
// in its unstaged diff and then its staged one, comments on one line in the order they were made,
// and after them those on lines neither diff has, or whose diffs aren't read, in the order they were
// made.
export function reviewList(comments: readonly ReviewComment[], diffOf: DiffOf): ListedFile[] {
  const files = new Map<string, Placing[]>();

  for (const comment of comments) {
    files.set(comment.path, [...(files.get(comment.path) ?? []), placing(diffOf, comment)]);
  }

  return [...files.entries()]
    .map(([path, placings]) => ({
      path,
      comments: placings.toSorted(byOrder).map(({ listed }) => listed),
    }))
    .toSorted(byPath);
}

// The file a comment's on, as a group lists it: the staged diff's in STAGED, and the unstaged
// diff's in MODIFIED, or else UNTRACKED. Undefined if no group lists it.
export function openFileOf(
  { diff, path }: CommentedFile,
  listed: Readonly<Record<GroupName, readonly string[]>>,
): OpenFile | undefined {
  const names: GroupName[] = diff === "staged" ? ["staged"] : ["modified", "untracked"];
  const group = names.find((name) => listed[name].includes(path));

  return group === undefined ? undefined : { group, path };
}

// The files partly staged: those both MODIFIED and STAGED list, whose diffs number each other's
// lines in the review.
export function partlyStaged(listed: Readonly<Record<GroupName, readonly string[]>>): string[] {
  return listed.staged.filter((path) => listed.modified.includes(path));
}

// The number a comment's line is labelled with: its number in the diff that has it, on the comment's
// side, or else the number the review has it at.
export function lineNumberOf({ comment, placed }: ListedComment): number {
  const shown = placedLine(placed);

  return (shown === undefined ? undefined : numberIn(shown.line, comment.side)) ?? comment.line;
}

// How many comments are pending on each file, by its path.
export function pendingCounts(comments: readonly ReviewComment[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const { path } of comments) {
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }

  return counts;
}

// How many comments are pending on the file a group lists, whichever of its diffs has their lines.
export function pendingOn(counts: ReadonlyMap<string, number>, { path }: OpenFile): number {
  return counts.get(path) ?? 0;
}

const marks = { context: "", removed: "\u2212", added: "+" };

// What a comment's line is labelled with in the review: its number in the diff that has it, marked
// as removed or added there, and whether that's the staged diff, or else the number the review has
// it at.
export function lineLabel(listed: ListedComment): string {
  const placed = placedLine(listed.placed);
  const number = String(lineNumberOf(listed));

  if (placed === undefined) {
    return number;
  }

  return `${marks[placed.line.kind]}${number}${placed.diff === "staged" ? " staged" : ""}`;
}

// What's said of a comment's line in the review, after its label: the line, as its diff has it, or
// that neither of its file's diffs has it now, or nothing while they aren't read.
export function lineNote(placed: Placed): string {
  if (placed === "gone") {
    return "No longer in its diffs";
  }

  return placed === "unread" ? "" : placed.line.text;
}

// What the sidebar says of a file's comments pending.
export function pendingLabel(count: number): string {
  return count === 1 ? "1 pending comment" : `${count} pending comments`;
}
