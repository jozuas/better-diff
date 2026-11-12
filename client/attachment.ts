import type { RpcOutput } from "@getpaseo/plugin";
import type { PluginCommandCapabilities } from "@getpaseo/plugin/client";

import type { diffRpc } from "../shared/diff";
import { rangeLabel } from "./comments";
import type { CommentTarget, ReviewComment } from "./comments";
import { numberLines, unchangedLines } from "./lines";
import type { NumberedLine } from "./lines";
import { numbered, numberingOf } from "./numbering";
import type { CommentedFile, Numbering } from "./numbering";
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
function rangeOf(side: Side, hunk: Hunk, lines: readonly NumberedLine[], review: Numbering) {
  const kept = lines.flatMap((line) => {
    const number = numbered(line, side, review);

    return number === undefined ? [] : [number];
  });

  const start = side === "old" ? hunk.oldStart : hunk.newStart;

  return range(signs[side], kept[0] ?? lastUpTo(review[side], start), kept.length);
}

// The hunk's header as git writes it, of its lines as the review numbers them, without the line git
// writes after it, as of the function the hunk is in. Where the file's other diff changes nothing,
// it's git's.
function hunkHeader(hunk: Hunk, lines: readonly NumberedLine[], review: Numbering): string {
  return `@@ ${rangeOf("old", hunk, lines, review)} ${rangeOf("new", hunk, lines, review)} @@`;
}

const types = { context: "context", removed: "remove", added: "add" } as const;

function contextLine(line: NumberedLine, review: Numbering): ContextLine {
  return {
    oldLineNumber: numbered(line, "old", review) ?? null,
    newLineNumber: numbered(line, "new", review) ?? null,
    type: types[line.kind],
    content: line.text,
  };
}

// How many lines around a comment's line the agent reads with it, as Paseo's own diff sends it:
// as many as git shows around a change.
const around = 3;

// Where a comment's line is in one of its file's diffs: the diff, the section of the diff it's in,
// its hunk, or undefined for a run of unchanged lines, and where that comes in the file, the
// section's lines, and the line at its index among them, the index of the first of the comment's
// lines, and how the review numbers the diff's lines.
interface Located {
  diff: CommentedFile["diff"];
  hunk: Hunk | undefined;
  section: number;
  lines: NumberedLine[];
  at: number;
  line: NumberedLine;
  from: number;
  numbering: Numbering;
}

// The index among the section's lines of the first of the comment's lines, of a comment on several,
// where the section has it before the line at the index `at`, which the comment's on, and else `at`.
function startIn(
  lines: readonly NumberedLine[],
  at: number,
  { start }: CommentTarget,
  numbering: Numbering,
): number {
  const from =
    start === undefined
      ? at
      : lines.findIndex((line) => numbered(line, start.side, numbering) === start.line);

  return from === -1 ? at : Math.min(from, at);
}

// A part of a diff a comment's line can be in: a hunk, or a run of unchanged lines around them,
// without one, and where it comes in the file: the run before the first hunk, then each hunk, and the
// run after it.
interface Section {
  hunk: Hunk | undefined;
  section: number;
  lines: NumberedLine[];
}

// The diff's hunks, and where it's read with every line of its version, the runs of unchanged lines
// around them.
function sectionsOf({ hunks, contents = [] }: ReadDiff): Section[] {
  const { before, after } = unchangedLines({ hunks, contents });

  return [
    ...hunks.map((hunk, index) => ({ hunk, section: 2 * index + 1, lines: numberLines(hunk) })),
    ...[before, ...after].map((lines, index) => ({ hunk: undefined, section: 2 * index, lines })),
  ];
}

// Where the comment's line is in the file's diff, as the review numbers it by the file's other
// diff, if the diff has it.
function locate(
  diff: CommentedFile["diff"],
  read: ReadDiff,
  other: Pick<Diff, "hunks">,
  target: CommentTarget,
): Located | undefined {
  const numbering = numberingOf(diff, other);

  for (const { lines, ...section } of sectionsOf(read)) {
    const at = lines.findIndex((line) => numbered(line, target.side, numbering) === target.line);
    const line = lines[at];

    if (line !== undefined) {
      return {
        diff,
        ...section,
        lines,
        at,
        line,
        from: startIn(lines, at, target, numbering),
        numbering,
      };
    }
  }

  return undefined;
}

// The hunk of the lines of a run of unchanged lines sent with a comment, as git writes a hunk of
// them. Where it starts in each version is never read: the comment's line, which both of the
// review's versions have, or else the file's other diff would change it and have it sent from its
// hunk, is among them.
// Stryker disable next-line ObjectLiteral,ArrayDeclaration: never read, as said above.
const unchangedHunk: Hunk = { oldStart: 0, newStart: 0, lines: [] };

// The comment's line and those around it in its section, as the review the agent reads has them,
// from before the first of its lines, for a comment on several, with the header of its hunk, or of
// those lines, of a run of unchanged lines.
function contextOf({ hunk, lines, at, line, from, numbering }: Located): ReviewContext {
  const sent = lines.slice(Math.max(0, from - around), at + around + 1);

  return {
    hunkHeader:
      hunk === undefined
        ? hunkHeader(unchangedHunk, sent, numbering)
        : hunkHeader(hunk, lines, numbering),
    targetLine: contextLine(line, numbering),
    lines: sent.map((each) => contextLine(each, numbering)),
  };
}

// What a comment sent says: for a comment on several lines, which they are first, since the agent
// reads it as on the last of them, the one marked among the lines around it.
function sentBody(comment: ReviewComment): string {
  const lines = rangeLabel(comment);

  return lines === undefined ? comment.body : `${lines}: ${comment.body}`;
}

// Why a comment pending isn't sent: its line is in neither of its file's diffs, or one of them can't
// be read.
export type Unsent = "gone" | "unread";

// A diff of a file comments are on, as read now: its hunks, and where it's read with them, every line
// of the version it goes to.
type ReadDiff = Pick<Diff, "hunks"> & Partial<Pick<Diff, "contents">>;

// The diff of a file comments are on, as read now, or undefined where it can't be read.
type DiffOf = (file: CommentedFile) => ReadDiff | undefined;

type SentComment = ReviewAttachment["comments"][number];

// Where a pending comment's line is in its file's diffs, if one has it, and what the review sends of
// the comment, or why it doesn't.
type Placement = { located: undefined; unsent: Unsent } | { located: Located; sent: SentComment };

// Where the comment's line is in the diffs of its file, the unstaged one's or else the staged one's,
// but one that changes the line before one that has it unchanged, and what the review sends of it.
function placementOf(comment: ReviewComment, diffOf: DiffOf): Placement {
  const unstaged = diffOf({ diff: "unstaged", path: comment.path });
  const staged = diffOf({ diff: "staged", path: comment.path });

  if (unstaged === undefined || staged === undefined) {
    return { located: undefined, unsent: "unread" };
  }

  const found = [
    locate("unstaged", unstaged, staged, comment),
    locate("staged", staged, unstaged, comment),
  ].flatMap((each) => (each === undefined ? [] : [each]));

  const located = found.find(({ line }) => line.kind !== "context") ?? found[0];

  return located === undefined
    ? { located, unsent: "gone" }
    : {
        located,
        sent: {
          filePath: comment.path,
          side: comment.side,
          lineNumber: comment.line,
          body: sentBody(comment),
          context: contextOf(located),
        },
      };
}

// A comment pending, and where its line is in its file's diffs.
export interface PlacedComment {
  comment: ReviewComment;
  placement: Placement;
}

// Where a comment comes among those on its file, by where its line is: by the diff that has it, the
// unstaged one before the staged one, its hunk there, or the run of unchanged lines, and its place
// in that, or after all of those where neither diff has it, or they can't be read.
type Order = readonly [number, number, number];

const diffOrder = { unstaged: 0, staged: 1 };

function orderOf({ located }: Placement): Order {
  return located === undefined ? [2, 0, 0] : [diffOrder[located.diff], located.section, located.at];
}

function byOrder([diff, hunk, at]: Order, [otherDiff, otherHunk, otherAt]: Order): number {
  if (diff !== otherDiff) {
    return diff - otherDiff;
  }

  return hunk === otherHunk ? at - otherAt : hunk - otherHunk;
}

// Each by path.
function byPath([path]: readonly [string, unknown], [other]: readonly [string, unknown]): number {
  // Stryker disable next-line EqualityOperator: no two files listed have the same path.
  return path < other ? -1 : 1;
}

// The comments pending, by the file each is on, with where each one's line is in the file's diffs,
// as read now: each file by path, and each file's comments in the order of their lines in its
// unstaged diff and then its staged one, comments on one line in the order they were made, and after
// them those on lines neither diff has, or whose diffs can't be read, in the order they were made.
export function placedByFile(
  comments: readonly ReviewComment[],
  diffOf: DiffOf,
): [string, PlacedComment[]][] {
  const files = new Map<string, { placed: PlacedComment; order: Order }[]>();

  for (const comment of comments) {
    const placement = placementOf(comment, diffOf);

    files.set(comment.path, [
      ...(files.get(comment.path) ?? []),
      { placed: { comment, placement }, order: orderOf(placement) },
    ]);
  }

  return [...files.entries()]
    .map(([path, placings]): [string, PlacedComment[]] => [
      path,
      placings
        .toSorted(({ order }, { order: other }) => byOrder(order, other))
        .map(({ placed }) => placed),
    ])
    .toSorted(byPath);
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
// comments on lines it has, with the lines around them, in the order the review lists them, and why
// each of the others isn't sent. No attachment where it has none of them.
export function reviewOf(
  directory: string,
  comments: readonly ReviewComment[],
  diffOf: DiffOf,
): Reviewed {
  const placed = placedByFile(comments, diffOf).flatMap(([, onFile]) => onFile);

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

// Both diffs of each of the files at the paths, once each.
export function bothDiffs(paths: readonly string[]): CommentedFile[] {
  return [...new Set(paths)].flatMap((path): CommentedFile[] => [
    { diff: "unstaged", path },
    { diff: "staged", path },
  ]);
}

// The diffs a review of the comments reads: both of each file they're on, once each, as either may
// have a comment's line, and each numbers the other's lines.
export function reviewedDiffs(comments: readonly ReviewComment[]): CommentedFile[] {
  return bothDiffs(comments.map(({ path }) => path));
}
