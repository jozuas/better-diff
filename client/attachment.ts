import type { RpcOutput } from "@getpaseo/plugin";
import type { PluginCommandCapabilities } from "@getpaseo/plugin/client";

import type { diffRpc } from "../shared/diff";
import { backward, forward } from "../shared/versions";
import { numberIn } from "./comments";
import type { CommentTarget, CommentedFile, ReviewComment } from "./comments";
import { numberLines } from "./lines";
import type { NumberedLine } from "./lines";
import type { Side } from "./side-by-side";

type Diff = RpcOutput<typeof diffRpc>;

type Hunk = Diff["hunks"][number];

type SendOptions = NonNullable<
  Parameters<ReturnType<PluginCommandCapabilities["paseo"]["agents"]["ref"]>["send"]>[1]
>;

// What Paseo's own diff sends an agent its review comments as, which the agent reads as each
// comment with the lines around the one it's on.
export type ReviewAttachment = Extract<
  NonNullable<SendOptions["attachments"]>[number],
  { type: "review" }
>;

type ReviewContext = ReviewAttachment["comments"][number]["context"];

type ContextLine = ReviewContext["targetLine"];

// The other diff of the file: the staged one of an unstaged diff's, and the unstaged one of a staged
// diff's.
function otherOf({ diff, path }: CommentedFile): CommentedFile {
  return { diff: diff === "unstaged" ? "staged" : "unstaged", path };
}

// What a line's number on a side of a diff is in the version the review has on that side, by the
// file's other diff, or undefined where that version doesn't have the line.
type Renumbering = Record<Side, (number: number) => number | undefined>;

function same(number: number): number {
  return number;
}

// How the lines of the diff, unstaged or staged, are numbered in the review, which is of the
// worktree's uncommitted changes, as Paseo's own diff's is: from HEAD, on the old side, to the
// worktree, on the new one. An unstaged diff goes from the index, and a staged one to it, and a line
// of the index is numbered as it is in HEAD, or in the worktree, by the file's other diff, unless
// that diff adds it, or removes it.
function renumbering(diff: CommentedFile["diff"], other: Pick<Diff, "hunks">): Renumbering {
  return diff === "unstaged"
    ? { old: (number) => backward(other.hunks, number), new: same }
    : { old: same, new: (number) => forward(other.hunks, number) };
}

// The line's number on the side as the review numbers it, if the side's version has it.
function renumbered(line: NumberedLine, side: Side, review: Renumbering): number | undefined {
  const number = numberIn(line, side);

  return number === undefined ? undefined : review[side](number);
}

// How git counts a version's lines in a hunk's header: a count of one isn't written.
function range(sign: string, start: number, count: number): string {
  return count === 1 ? `${sign}${start}` : `${sign}${start},${count}`;
}

// The number in the review of the last line, up to the number, that the version has, or 0 if it has
// none.
function lastUpTo(renumber: (number: number) => number | undefined, number: number): number {
  let each = number;

  while (each >= 1) {
    const kept = renumber(each);

    if (kept !== undefined) {
      return kept;
    }

    each -= 1;
  }

  return 0;
}

const signs = { old: "-", new: "+" } as const;

// The side's range in the hunk's header, as git writes it, of the hunk's lines as the review numbers
// them: from the first of them that the side's version has, and how many it has, or, where it has
// none, after the last line before them that it has. A hunk without lines on the side starts after
// the line before it, and one with lines that the side's version hasn't starts with one of them.
function rangeOf(side: Side, hunk: Hunk, lines: readonly NumberedLine[], review: Renumbering) {
  const kept = lines.flatMap((line) => {
    const number = renumbered(line, side, review);

    return number === undefined ? [] : [number];
  });

  const start = side === "old" ? hunk.oldStart : hunk.newStart;

  return range(signs[side], kept[0] ?? lastUpTo(review[side], start), kept.length);
}

// The hunk's header as git writes it, of its lines as the review numbers them, without the line git
// writes after it, as of the function the hunk is in. Where the file's other diff changes nothing,
// it's git's.
function hunkHeader(hunk: Hunk, lines: readonly NumberedLine[], review: Renumbering): string {
  return `@@ ${rangeOf("old", hunk, lines, review)} ${rangeOf("new", hunk, lines, review)} @@`;
}

const types = { context: "context", removed: "remove", added: "add" } as const;

function contextLine(line: NumberedLine, review: Renumbering): ContextLine {
  return {
    oldLineNumber: renumbered(line, "old", review) ?? null,
    newLineNumber: renumbered(line, "new", review) ?? null,
    type: types[line.kind],
    content: line.text,
  };
}

// How many lines around a comment's line the agent reads with it, as Paseo's own diff sends it:
// as many as git shows around a change.
const around = 3;

// Where a comment's line is in a diff: its hunk, and the hunk's index among the diff's, the
// hunk's lines, and the line at its index among them.
interface Located {
  hunk: Hunk;
  index: number;
  lines: NumberedLine[];
  at: number;
  line: NumberedLine;
}

// Where the comment's line is in the diff, if the diff has it.
function locate(diff: Pick<Diff, "hunks">, target: CommentTarget): Located | undefined {
  for (const [index, hunk] of diff.hunks.entries()) {
    const lines = numberLines(hunk);
    const at = lines.findIndex((line) => numberIn(line, target.side) === target.line);
    const line = lines[at];

    if (line !== undefined) {
      return { hunk, index, lines, at, line };
    }
  }

  return undefined;
}

// The comment's line and those around it in its hunk, as the review the agent reads has them.
function contextOf({ hunk, lines, at, line }: Located, review: Renumbering): ReviewContext {
  return {
    hunkHeader: hunkHeader(hunk, lines, review),
    targetLine: contextLine(line, review),
    lines: lines
      .slice(Math.max(0, at - around), at + around + 1)
      .map((each) => contextLine(each, review)),
  };
}

const opposite = { old: "new", new: "old" } as const;

// Where the review has a comment on the side of the line: by the line's number on the side, or,
// where the review's version hasn't it, by its number on the other, which only an unchanged line
// has, as one staged after HEAD. Undefined for a line only the index has, staged and then changed in
// the worktree.
function sentAt(line: NumberedLine, side: Side, review: Renumbering) {
  return [side, opposite[side]].flatMap((version) => {
    const lineNumber = renumbered(line, version, review);

    return lineNumber === undefined ? [] : [{ side: version, lineNumber }];
  })[0];
}

type SentComment = ReviewAttachment["comments"][number];

// Why a comment pending isn't sent: its line is no longer in its diff, one of its file's diffs can't
// be read, or its line is only in the index, staged and then changed in the worktree, which neither
// version the review is of has.
export type Unsent = "gone" | "unread" | "changed";

// The diff of a file comments are on, as read now, or undefined where it can't be read.
type DiffOf = (file: CommentedFile) => Pick<Diff, "hunks"> | undefined;

// Where a pending comment's line is in its diff, if its diff has it, and what the review sends of
// the comment, or why it doesn't.
export type Placement =
  | { located: undefined; unsent: "gone" | "unread" }
  | { located: Located; unsent: "unread" | "changed" }
  | { located: Located; sent: SentComment };

// Where the comment's line is in its diff, and what the review sends of it, by the diffs of its file.
export function placementOf(comment: ReviewComment, diffOf: DiffOf): Placement {
  const diff = diffOf(comment);
  const located = diff === undefined ? undefined : locate(diff, comment);

  if (located === undefined) {
    return { located, unsent: diff === undefined ? "unread" : "gone" };
  }

  const other = diffOf(otherOf(comment));

  if (other === undefined) {
    return { located, unsent: "unread" };
  }

  const review = renumbering(comment.diff, other);
  const at = sentAt(located.line, comment.side, review);

  return at === undefined
    ? { located, unsent: "changed" }
    : {
        located,
        sent: {
          filePath: comment.path,
          ...at,
          body: comment.body,
          context: contextOf(located, review),
        },
      };
}

// What a review sends: an attachment of the comments it sends, if any, those comments, and why each
// of the others isn't sent.
export interface Reviewed {
  attachment: ReviewAttachment | undefined;
  sent: ReviewComment[];
  unsent: Unsent[];
}

// What reviewing the worktree in the directory sends of the comments, as Paseo's own diff sends a
// review of its uncommitted changes, by the diffs of the files they're on, as they are now: the
// comments on lines it has, with the lines around them, in the order they were made, and why each of
// the others isn't sent. No attachment where it has none of them.
export function reviewOf(
  directory: string,
  comments: readonly ReviewComment[],
  diffOf: DiffOf,
): Reviewed {
  const placed = comments.map((comment) => ({ comment, placement: placementOf(comment, diffOf) }));

  const reviewed = placed.flatMap(({ comment, placement }) =>
    "sent" in placement ? [{ comment, sent: placement.sent }] : [],
  );

  return {
    attachment:
      reviewed.length === 0
        ? undefined
        : {
            type: "review",
            mimeType: "application/paseo-review",
            cwd: directory,
            mode: "uncommitted",
            baseRef: null,
            comments: reviewed.map(({ sent }) => sent),
          },
    sent: reviewed.map(({ comment }) => comment),
    unsent: placed.flatMap(({ placement }) => ("unsent" in placement ? [placement.unsent] : [])),
  };
}

// The diffs a review of the comments reads: both of each file they're on, once each, as a comment
// on one is numbered by the other.
export function reviewedDiffs(comments: readonly ReviewComment[]): CommentedFile[] {
  const paths = new Set(comments.map(({ path }) => path));

  return [...paths].flatMap((path): CommentedFile[] => [
    { diff: "unstaged", path },
    { diff: "staged", path },
  ]);
}
