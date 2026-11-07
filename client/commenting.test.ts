import * as fc from "fast-check";
import { expect, test, vi } from "vitest";

import { asNumbered, reviewComments } from "../test/comments";
import { hunkLines } from "../test/hunk-lines";
import { commentedBy, commentsOn, pointedIn, subscribeToPointed } from "./commenting";
import type { Commented, Commenting } from "./commenting";
import { shownOn, targetOf, threadAt, threadsOf } from "./comments";
import type { Editing, ReviewComment } from "./comments";
import type { NumberedLine } from "./lines";
import { pointedLine } from "./pointed";
import type { LineAt } from "./pointed";
import type { Review } from "./review-context";
import { rowsOf, shows } from "./side-by-side";
import type { Side } from "./side-by-side";

const file = { path: "a.txt", numbering: asNumbered };

function reviewOf(comments: readonly ReviewComment[], editing?: Editing): Review {
  return {
    numbering: vi.fn<Review["numbering"]>(),
    threads: threadsOf(comments),
    editing,
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

function commentingOf(): Commenting {
  return { file, pointed: pointedLine() };
}

test("lines are commented on only where they can be, in a view that reviews", () => {
  const review = reviewOf([]);
  const commenting = commentingOf();
  const pointed = { index: 1, side: undefined };

  expect(commentedBy(review, commenting, pointed)).toStrictEqual({
    file,
    pointer: commenting.pointed.pointer,
    pointed,
    review,
  });
  expect(commentedBy(undefined, commenting, pointed)).toBeUndefined();
  expect(commentedBy(review, undefined, pointed)).toBeUndefined();
});

const sides = fc.constantFrom<Side | undefined>(undefined, "old", "new");

// The line the pointer is over: any of a few, on any side, or none.
const pointedAt = fc.option(fc.record({ index: fc.nat(4), side: sides }), { nil: undefined });

// What commenting on the lines gives each, in parts that compare as values: whether it hears the
// pointer, whether it can start a comment, and what shows under it.
function partsOf(commented: Commented, lines: readonly NumberedLine[], side: Side | undefined) {
  return lines.map((line, index) => {
    const comments = commentsOn(commented, { index, line }, side);

    return {
      pointer: comments.pointer === commented.pointer({ index, side }),
      starts: comments.onComment !== undefined,
      thread: comments.thread,
    };
  });
}

// What each line the side shows, or that shows inline, is commented on with: what hears the pointer
// come over it, a button that starts a comment while it's over it, and its comments.
function expectedParts(
  commented: Commented,
  lines: readonly NumberedLine[],
  side: Side | undefined,
  pointed: LineAt | undefined,
) {
  return lines.map((line, index) => {
    const target = targetOf(file, line, side);
    const shown = shows(side, line.kind) && target !== undefined;

    return {
      pointer: shown,
      starts: shown && pointed?.index === index && pointed.side === side,
      thread: shown
        ? threadAt(commented.review.threads, commented.review.editing, shownOn(file, line, side))
        : undefined,
    };
  });
}

test("a line shown can be commented on: it hears the pointer, starts a comment while the pointer's over it, and shows its comments", () => {
  fc.assert(
    fc.property(hunkLines, sides, pointedAt, reviewComments, (lines, side, pointed, comments) => {
      const commenting = commentingOf();
      const review = reviewOf(comments.map((comment) => ({ ...comment, path: file.path })));
      const commented = { file, pointer: commenting.pointed.pointer, pointed, review };

      expect(partsOf(commented, lines, side)).toStrictEqual(
        expectedParts(commented, lines, side, pointed),
      );
    }),
  );
});

test("the button over a line starts a comment on it", () => {
  const commenting = commentingOf();
  const review = reviewOf([]);

  const line: NumberedLine = {
    kind: "context",
    text: "kept",
    newline: true,
    runs: [],
    oldNumber: 2,
    newNumber: 3,
  };

  const comments = commentsOn(
    { file, pointer: commenting.pointed.pointer, pointed: { index: 0, side: "old" }, review },
    { index: 0, line },
    "old",
  );

  comments.onComment?.();

  expect(review.onStart).toHaveBeenCalledWith({ path: "a.txt", side: "old", line: 2 });
});

// What the review numbers a line of a version it hasn't.
function notInReview(): number | undefined {
  return undefined;
}

test("lines that can't be commented on, or aren't there, have nothing to comment with", () => {
  const commenting = commentingOf();
  const review = reviewOf([]);

  const line: NumberedLine = {
    kind: "added",
    text: "new",
    newline: true,
    runs: [],
    oldNumber: undefined,
    newNumber: 1,
  };

  const commented = { file, pointer: commenting.pointed.pointer, pointed: undefined, review };
  const nothing = { pointer: undefined, onComment: undefined, thread: undefined };

  expect(commentsOn(undefined, { index: 0, line })).toStrictEqual(nothing);
  expect(commentsOn(commented, undefined, "new")).toStrictEqual(nothing);
  expect(commentsOn(commented, { index: 0, line }, "old")).toStrictEqual(nothing);

  // A line only the index has, staged and then changed in the worktree.
  const indexOnly = { ...file, numbering: { old: notInReview, new: notInReview } };

  expect(
    commentsOn(
      {
        ...commented,
        file: indexOnly,
        review: reviewOf([{ path: file.path, side: "new", line: 1, id: 1, body: "" }]),
      },
      { index: 0, line },
      "new",
    ),
  ).toStrictEqual(nothing);
});

// Whether the line at the index is among those from `start` up to `end` of the lines inline, or
// of their rows side by side.
function isShown(
  lines: readonly NumberedLine[],
  sideBySide: boolean,
  index: number,
  [start, end]: [number, number],
): boolean {
  return sideBySide
    ? rowsOf(lines, new Map())
        .slice(start, end)
        .some((row) => row.old?.index === index || row.new?.index === index)
    : index >= start && index < end;
}

const span = fc
  .tuple(fc.nat(8), fc.nat(8))
  .map(([one, other]): [number, number] => [Math.min(one, other), Math.max(one, other)]);

// Lines that can be commented on, with the pointer over the line, if there's one.
function pointedOver(line: LineAt | undefined): Commenting {
  const commenting = commentingOf();

  if (line !== undefined) {
    commenting.pointed.pointer(line).onPointerEnter();
  }

  return commenting;
}

// The line the pointer is over, as the commenting has it, if the block shows it.
function shownIn(
  commenting: Commenting,
  lines: readonly NumberedLine[],
  sideBySide: boolean,
  block: [number, number],
): LineAt | undefined {
  const line = commenting.pointed.line();

  return line !== undefined && isShown(lines, sideBySide, line.index, block) ? line : undefined;
}

function rowsIf(lines: readonly NumberedLine[], sideBySide: boolean) {
  return sideBySide ? rowsOf(lines, new Map()) : undefined;
}

test("a block has the line the pointer is over only if it shows it", () => {
  fc.assert(
    fc.property(hunkLines, fc.boolean(), pointedAt, span, (lines, sideBySide, pointed, block) => {
      const commenting = pointedOver(pointed);
      const rows = rowsIf(lines, sideBySide);

      expect(pointedIn(commenting, rows, ...block)).toBe(
        shownIn(commenting, lines, sideBySide, block),
      );
      expect(pointedIn(undefined, rows, ...block)).toBeUndefined();
    }),
  );
});

test("lines that can be commented on hear the pointer move between them, and others hear nothing", () => {
  const commenting = commentingOf();
  const heard = vi.fn<() => void>();
  const unsubscribe = subscribeToPointed(commenting)(heard);

  commenting.pointed.pointer({ index: 0, side: undefined }).onPointerEnter();
  unsubscribe();
  commenting.pointed.pointer({ index: 1, side: undefined }).onPointerEnter();

  expect(heard).toHaveBeenCalledTimes(1);
  expect(subscribeToPointed()(heard)).toBeTypeOf("function");
});
