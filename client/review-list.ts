import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";
import { placementOf } from "./attachment";
import type { CommentedFile, ReviewComment } from "./comments";
import { groups } from "./groups";
import type { GroupName, OpenFile } from "./groups";
import type { NumberedLine } from "./lines";

type Diff = RpcOutput<typeof diffRpc>;

// Tells the diff of a file comments are on apart from others.
export function fileKey({ diff, path }: CommentedFile): string {
  return JSON.stringify([diff, path]);
}

// Where a pending comment's line is in its file's diff as read now: the line, and whether it's only
// in the index, staged and then changed in the worktree, which the review doesn't send, or that the
// diff doesn't have it, or that the diff isn't read yet, or can't be.
export type Placed = { line: NumberedLine; changed: boolean } | "gone" | "unread";

export interface ListedComment {
  comment: ReviewComment;
  placed: Placed;
}

export interface ListedFile {
  file: CommentedFile;
  comments: ListedComment[];
}

// Where a comment comes in its file's list: by its line's hunk and its place in the hunk, or after
// all of them where the diff hasn't the line, or isn't read.
type Order = [number, number];

// A comment as listed, and where it comes in its file's list.
interface Placing {
  listed: ListedComment;
  order: Order;
}

function placing(diffOf: DiffOf, comment: ReviewComment): Placing {
  const placement = placementOf(comment, diffOf);
  const { located } = placement;

  if (located === undefined) {
    return { listed: { comment, placed: placement.unsent }, order: [Infinity, 0] };
  }

  const changed = "unsent" in placement && placement.unsent === "changed";

  return {
    listed: { comment, placed: { line: located.line, changed } },
    order: [located.index, located.at],
  };
}

function byOrder({ order: [hunk, at] }: Placing, { order: [otherHunk, otherAt] }: Placing): number {
  return hunk === otherHunk ? at - otherAt : hunk - otherHunk;
}

// Unstaged files before staged ones, and each by path.
function byFile(
  { file }: { file: CommentedFile },
  { file: other }: { file: CommentedFile },
): number {
  if (file.diff !== other.diff) {
    return file.diff === "unstaged" ? -1 : 1;
  }

  // Stryker disable next-line EqualityOperator: no two of a diff's files have the same path.
  return file.path < other.path ? -1 : 1;
}

// The diff of a file, as read now, if it is.
type DiffOf = (file: CommentedFile) => Pick<Diff, "hunks"> | undefined;

// The comments pending, by the file each is on, with where each one's line is in the file's diff,
// by the diffs of the files, as read now, if they are: unstaged files before staged ones, and each by
// path, and each file's comments in the order of their lines in its diff, comments on one line in
// the order they were made, and after them those on lines it hasn't, or whose diff isn't read, in
// the order they were made.
export function reviewList(comments: readonly ReviewComment[], diffOf: DiffOf): ListedFile[] {
  const files = new Map<string, { file: CommentedFile; placings: Placing[] }>();

  for (const comment of comments) {
    const key = fileKey(comment);

    const file = files.get(key) ?? {
      file: { diff: comment.diff, path: comment.path },
      placings: [],
    };

    file.placings.push(placing(diffOf, comment));
    files.set(key, file);
  }

  return [...files.values()].toSorted(byFile).map(({ file, placings }) => ({
    file,
    comments: placings.toSorted(byOrder).map(({ listed }) => listed),
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

// How many comments are pending on each file's diff, by its key.
export function pendingCounts(comments: readonly ReviewComment[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const comment of comments) {
    const key = fileKey(comment);

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

// How many comments are pending on the diff of the file a group lists.
export function pendingOn(counts: ReadonlyMap<string, number>, { group, path }: OpenFile): number {
  return counts.get(fileKey({ diff: groups[group].side, path })) ?? 0;
}

// What a comment's line is marked with in the review: whether the diff removes it or adds it.
export function lineMark(placed: Placed): string {
  const marks = { context: "", removed: "\u2212", added: "+" };

  return placed === "gone" || placed === "unread" ? "" : marks[placed.line.kind];
}

// What's said of a comment's line in the review, after its number: the line, as its diff has it, or
// that it no longer has it, or that it's changed since it was staged, or nothing while it isn't
// read.
export function lineNote(placed: Placed): string {
  if (placed === "gone") {
    return "No longer in its diff";
  }

  if (placed === "unread") {
    return "";
  }

  return placed.changed ? "Changed since it was staged" : placed.line.text;
}

// What a file's comments are listed under in the review: its path, and whether they're on its
// staged changes.
export function fileHeading({ diff, path }: CommentedFile): string {
  return diff === "staged" ? `${path} (staged)` : path;
}

// What the sidebar says of a file's comments pending.
export function pendingLabel(count: number): string {
  return count === 1 ? "1 pending comment" : `${count} pending comments`;
}
