import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";
import { placedByFile } from "./attachment";
import type { PlacedComment, Unsent } from "./attachment";
import { rangeNumbers } from "./comments";
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

// What the review lists of a comment: where its line is in the diff that has it, or why it isn't
// sent.
function listedOf({ comment, placement }: PlacedComment): ListedComment {
  const { located } = placement;

  return located === undefined
    ? { comment, placed: placement.unsent }
    : { comment, placed: { line: located.line, diff: located.diff } };
}

// The diff of a file, as read now, if it is.
type DiffOf = (file: CommentedFile) => Pick<Diff, "hunks"> | undefined;

// The comments pending, by the file each is on, with where each one's line is in the file's diffs,
// as read now, if they are, in the order the review sends them: each file by path, and each file's
// comments in the order of their lines in its unstaged diff and then its staged one, comments on one
// line in the order they were made, and after them those on lines neither diff has, or whose diffs
// aren't read, in the order they were made.
export function reviewList(comments: readonly ReviewComment[], diffOf: DiffOf): ListedFile[] {
  return placedByFile(comments, diffOf).map(([path, placed]) => ({
    path,
    comments: placed.map(listedOf),
  }));
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
function lineNumberOf({ comment, placed }: ListedComment): number {
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
// as removed or added there, or else the number the review has it at, or for a comment on several
// lines, their numbers as the review has them, and whether the diff is the staged one.
export function lineLabel(listed: ListedComment): string {
  const placed = placedLine(listed.placed);
  const range = rangeNumbers(listed.comment);
  const number = String(lineNumberOf(listed));

  if (placed === undefined) {
    return range ?? number;
  }

  return `${range ?? marks[placed.line.kind] + number}${placed.diff === "staged" ? " staged" : ""}`;
}

// What the button that shows a comment in its diff is called: by its line, or its lines.
export function linkLabel(listed: ListedComment): string {
  const range = rangeNumbers(listed.comment);
  const lines = range === undefined ? `line ${String(lineNumberOf(listed))}` : `lines ${range}`;

  return `Show ${lines} of ${listed.comment.path}`;
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
