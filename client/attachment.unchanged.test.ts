import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { diffRpc } from "../shared/diff";
import { partlyStaged } from "../test/comments";
import { reviewOf } from "./attachment";
import type { ReviewAttachment } from "./attachment";
import type { CommentTarget } from "./comments";
import type { CommentedFile } from "./numbering";
import type { Side } from "./side-by-side";

type Diff = RpcOutput<typeof diffRpc>;

type Read = Pick<Diff, "hunks" | "contents">;

type Line = Diff["hunks"][number]["lines"][number];

type Sent = ReviewAttachment["comments"][number];

type PartlyStaged = typeof partlyStaged extends fc.Arbitrary<infer File> ? File : never;

const path = "a.txt";

function contentsOf(lines: readonly string[]): Diff["contents"] {
  return lines.map((text) => ({ text, runs: [] }));
}

// The file's diffs, read with every line of the versions they go to: the worktree, for the unstaged
// one, and the index, for the staged one.
function readWithContents({ versions, diffs }: PartlyStaged): Record<CommentedFile["diff"], Read> {
  return {
    unstaged: { ...diffs.unstaged, contents: contentsOf(versions.worktree) },
    staged: { ...diffs.staged, contents: contentsOf(versions.index) },
  };
}

// A comment on each line of the version on the side.
function targetsOn(side: Side, lines: readonly string[]): CommentTarget[] {
  return lines.map((_, at) => ({ path, side, line: at + 1 }));
}

// What each comment sent is on, and what its line says.
function sentOn({ side, lineNumber, context }: Sent): [Side, number, string] {
  return [side, lineNumber, context.targetLine.content];
}

// The lines sent with a comment whose numbers aren't those of the lines of HEAD and the worktree
// that say what they say.
function misnumbered(
  { context }: Sent,
  head: readonly string[],
  worktree: readonly string[],
): unknown[] {
  return context.lines.filter(
    ({ oldLineNumber, newLineNumber, content }) =>
      (oldLineNumber !== null && head[oldLineNumber - 1] !== content) ||
      (newLineNumber !== null && worktree[newLineNumber - 1] !== content),
  );
}

function bySideAndLine(
  [side, line]: readonly [Side, number, string],
  [otherSide, otherLine]: readonly [Side, number, string],
): number {
  return side === otherSide ? line - otherLine : side.localeCompare(otherSide);
}

// What each comment on the targets is on, and what its line says in HEAD or the worktree.
function expectedOn(
  targets: readonly CommentTarget[],
  { head, worktree }: PartlyStaged["versions"],
): [Side, number, string][] {
  return targets
    .map(({ side, line }): [Side, number, string] => [
      side,
      line,
      (side === "old" ? head : worktree)[line - 1] ?? "",
    ])
    .toSorted(bySideAndLine);
}

// Whether a comment's sent on an unchanged line only one of HEAD and the worktree has, which the
// file's other diff changes, and so would send it from its hunk.
function inOneVersion({ context: { targetLine } }: Sent): boolean {
  return (
    targetLine.type === "context" &&
    (targetLine.oldLineNumber === null || targetLine.newLineNumber === null)
  );
}

// The comments an attachment has, or none without one.
function attachedOf({ attachment }: ReturnType<typeof reviewOf>): Sent[] {
  return attachment?.comments ?? [];
}

test("once its file's diffs are read with every line, a comment on any line of HEAD or the worktree, changed or not, is sent with it and the lines around it, numbered as HEAD and the worktree number them, and on an unchanged line, from a diff that has it in both", () => {
  fc.assert(
    fc.property(partlyStaged, (file) => {
      const read = readWithContents(file);
      const { head, worktree } = file.versions;
      const targets = [...targetsOn("old", head), ...targetsOn("new", worktree)];
      const comments = targets.map((target, at) => ({ ...target, id: at + 1, body: "" }));
      const review = reviewOf("/repository", comments, ({ diff }) => read[diff]);
      const sent = attachedOf(review);

      expect(review.unsent).toStrictEqual([]);
      expect(sent.map(sentOn).toSorted(bySideAndLine)).toStrictEqual(
        expectedOn(targets, file.versions),
      );
      expect(sent.flatMap((each) => misnumbered(each, head, worktree))).toStrictEqual([]);
      expect(sent.filter(inOneVersion)).toStrictEqual([]);
    }),
  );
});

function lineOf(kind: Line["kind"], text: string): Line {
  return { kind, text, newline: true, runs: [] };
}

// A file of twenty lines, each its number, but the tenth, which the worktree changes from "ten":
// its staged diff changes nothing, and its unstaged one has one hunk, with three unchanged lines
// either side of the change, and the unchanged lines around it before and after.
const tenth: Record<CommentedFile["diff"], Read> = {
  unstaged: {
    hunks: [
      {
        oldStart: 7,
        newStart: 7,
        lines: [
          lineOf("context", "7"),
          lineOf("context", "8"),
          lineOf("context", "9"),
          lineOf("removed", "ten"),
          lineOf("added", "10"),
          lineOf("context", "11"),
          lineOf("context", "12"),
          lineOf("context", "13"),
        ],
      },
    ],
    contents: contentsOf(Array.from({ length: 20 }, (_, at) => String(at + 1))),
  },
  staged: {
    hunks: [],
    contents: contentsOf(
      Array.from({ length: 20 }, (_, at) => (at === 9 ? "ten" : String(at + 1))),
    ),
  },
};

// What comments on the lines of the worktree with the numbers are sent with, in the order sent.
function sentWith(lines: readonly number[]): [number, string, number[]][] {
  const comments = lines.map((line, at) => ({
    path,
    side: "new" as const,
    line,
    id: at + 1,
    body: "",
  }));

  return attachedOf(reviewOf("/repository", comments, ({ diff }) => tenth[diff])).map(
    ({ lineNumber, context }) => [
      lineNumber,
      context.hunkHeader,
      context.lines.map(({ newLineNumber }) => newLineNumber ?? 0),
    ],
  );
}

test("a comment on an unchanged line outside the hunks is sent with up to three lines either side of it of those outside them, under a header of those lines, in the order of the file's lines", () => {
  expect(sentWith([16, 10, 2, 20])).toStrictEqual([
    [2, "@@ -1,5 +1,5 @@", [1, 2, 3, 4, 5]],
    [10, "@@ -7,7 +7,7 @@", [8, 9, 0, 10, 11, 12, 13]],
    [16, "@@ -14,6 +14,6 @@", [14, 15, 16, 17, 18, 19]],
    [20, "@@ -17,4 +17,4 @@", [17, 18, 19, 20]],
  ]);
});
