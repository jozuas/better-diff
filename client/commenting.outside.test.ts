import * as fc from "fast-check";
import { expect, test, vi } from "vitest";

import { numberedFile, commentTarget, diffHunks, reviewComments } from "../test/comments";
import { hasComments, linesCommented } from "./commenting";
import { threadsOf } from "./comments";
import type { CommentTarget, Editing, NumberedFile, ReviewComment } from "./comments";
import type { NumberedLine } from "./lines";
import type { CommentedFile } from "./numbering";
import type { Review } from "./review-context";

const file = numberedFile("a.txt");

// Whether a line of the hunks is the target's line, on the target's side.
function isOn(line: NumberedLine, { side, line: number }: CommentTarget): boolean {
  return (side === "old" ? line.oldNumber : line.newNumber) === number;
}

// What's commented on under lines of the file: the comments' lines, and the comment's being written
// under a line, if one is.
function onFile(targets: readonly CommentTarget[], editing?: Editing): CommentTarget[] {
  return [
    ...targets,
    ...[editing].flatMap((each) => (each?.where === "line" ? [each.target] : [])),
  ].filter(({ path }) => path === file.path);
}

// Nothing under any line.
const nothing = { threads: new Map(), editing: undefined };

// The view's review, of what shows under the lines of the file's diffs, and under no other file's,
// and the paths of the files commented on.
function reviewShowing(
  comments: readonly ReviewComment[],
  paths: readonly string[],
  written?: Editing,
): Review {
  const shown = { threads: threadsOf(comments), editing: written };

  return {
    commentsIn: (path) => (path === file.path ? shown : nothing),
    commentedOn: (path) => paths.includes(path),
    editing: undefined,
    revealing: undefined,
    onStart: vi.fn<Review["onStart"]>(),
    onEdit: vi.fn<Review["onEdit"]>(),
    written: vi.fn<Review["written"]>(),
    onWrite: vi.fn<Review["onWrite"]>(),
    onCancel: vi.fn<Review["onCancel"]>(),
    onSave: vi.fn<Review["onSave"]>(),
    onDelete: vi.fn<Review["onDelete"]>(),
  };
}

// What says whether a line of the file's diff has comments under it, of the comments and the one
// being written, as the review shows them under its lines.
function commentedWith(
  comments: readonly ReviewComment[],
  written: Editing | undefined,
): (line: NumberedLine) => boolean {
  return linesCommented(reviewShowing(comments, [], written).commentsIn, file) ?? (() => false);
}

// Whether each of the lines has comments under it, as the review shows them under the file's lines.
function commentedAmong(review: Review, lines: readonly NumberedLine[]): boolean[] {
  return lines.map(linesCommented(review.commentsIn, file) ?? (() => false));
}

// No file, as while the lines of a diff can't be commented on.
function noFile(): NumberedFile | undefined {
  return undefined;
}

// No file's diff, as while the lines of a diff can't be commented on.
function noDiff(): CommentedFile | undefined {
  return undefined;
}

// A comment being written, on a line or in the review's list, or none.
const editing = fc.option(
  fc.record({
    target: commentTarget,
    id: fc.option(fc.nat(20), { nil: undefined }),
    where: fc.constantFrom<Editing["where"]>("line", "list"),
  }),
  { nil: undefined },
);

test("a line has comments under it while a comment's on it, on either side, or one's being written under it", () => {
  fc.assert(
    fc.property(diffHunks, reviewComments, editing, ({ numbered }, comments, written) => {
      const commented = commentedWith(comments, written);

      expect(numbered.flat().map(commented)).toStrictEqual(
        numbered
          .flat()
          .map((line) => onFile(comments, written).some((target) => isOn(line, target))),
      );
    }),
  );
});

test("a line of a file's diff has comments under it as the review shows them under the file's lines, while they can be commented on", () => {
  fc.assert(
    fc.property(diffHunks, reviewComments, ({ numbered }, comments) => {
      const lines = numbered.flat();

      expect(commentedAmong(reviewShowing(comments, []), lines)).toStrictEqual(
        lines.map((line) => onFile(comments).some((target) => isOn(line, target))),
      );
    }),
  );
  expect(linesCommented(undefined, file)).toBeUndefined();
  expect(linesCommented(reviewShowing([], []).commentsIn, noFile())).toBeUndefined();
});

test("a file's diff has comments while the review has some on its file, or one being written on it, while its lines can be commented on", () => {
  const review = reviewShowing([], ["a.txt"]);
  const onA = { diff: "unstaged", path: "a.txt" } as const;

  expect(hasComments(review, onA)).toBe(true);
  expect(hasComments(review, { ...onA, path: "b.txt" })).toBe(false);
  expect(hasComments(undefined, onA)).toBe(false);
  expect(hasComments(review, noDiff())).toBe(false);
});
