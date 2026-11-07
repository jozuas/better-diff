import * as fc from "fast-check";
import { expect, test } from "vitest";

import { asNumbered, commentTarget, reviewComments } from "../test/comments";
import { hunkLines } from "../test/hunk-lines";
import { editedIn, shownOn, targetOf, threadAt, threadsOf } from "./comments";
import type { CommentTarget, Editing, ReviewComment } from "./comments";
import type { NumberedLine } from "./lines";
import { shows } from "./side-by-side";
import type { Side } from "./side-by-side";

const file = { path: "a.txt", numbering: asNumbered };

const path = "a.txt";

const removed: NumberedLine = {
  kind: "removed",
  text: "gone",
  newline: true,
  runs: [],
  oldNumber: 3,
  newNumber: undefined,
};

const added: NumberedLine = { ...removed, kind: "added", oldNumber: undefined, newNumber: 4 };

const unchanged: NumberedLine = { ...removed, kind: "context", oldNumber: 2, newNumber: 5 };

test("inline, the comments under an unchanged line are those on either of its numbers, and under any other line those on its one; side by side, those on the number its side shows", () => {
  expect([removed, added, unchanged].map((line) => shownOn(file, line))).toStrictEqual([
    [{ path, side: "old", line: 3 }],
    [{ path, side: "new", line: 4 }],
    [
      { path, side: "old", line: 2 },
      { path, side: "new", line: 5 },
    ],
  ]);
  expect(
    (["old", "new"] as const).map((side) =>
      [removed, added, unchanged].map((line) => shownOn(file, line, side)),
    ),
  ).toStrictEqual([
    [[{ path, side: "old", line: 3 }], [], [{ path, side: "old", line: 2 }]],
    [[], [{ path, side: "new", line: 4 }], [{ path, side: "new", line: 5 }]],
  ]);
});

const sides = fc.constantFrom<Side | undefined>(undefined, "old", "new");

// The lines a comment on the line can be on, as made on the side, or inline, where it's made on
// either side side by side too, each as one string.
function madeOn(line: NumberedLine, side: Side | undefined): Set<string> {
  const ways = side === undefined ? [undefined, "old" as const, "new" as const] : [side];

  return new Set(
    ways.flatMap((way) => {
      const target = targetOf(file, line, way);

      return target === undefined ? [] : [JSON.stringify(target)];
    }),
  );
}

test("a comment shows under its line however it was made, inline or on either side side by side, and side by side under the side it was made on", () => {
  fc.assert(
    fc.property(hunkLines, sides, (lines, side) => {
      expect(
        lines.map((line) => new Set(shownOn(file, line, side).map((each) => JSON.stringify(each)))),
      ).toStrictEqual(lines.map((line) => madeOn(line, side)));
    }),
  );
});

// The lines the lines shown on the side, or inline, are commented on, each as one string.
function commentedLines(lines: readonly NumberedLine[], side: Side | undefined): string[] {
  return lines.flatMap((line) => {
    const target = targetOf(file, line, side);

    return target === undefined ? [] : [JSON.stringify(target)];
  });
}

test.each([undefined, "old", "new"] as const)(
  "each of a hunk's lines shown, on the %s side, is commented on at a line of its own",
  (side) => {
    fc.assert(
      fc.property(hunkLines, (lines) => {
        const commented = commentedLines(lines, side);

        expect(commented).toHaveLength(lines.filter(({ kind }) => shows(side, kind)).length);
        expect(new Set(commented).size).toBe(commented.length);
      }),
    );
  },
);

function sameTarget(target: CommentTarget, other: CommentTarget): boolean {
  return target.path === other.path && target.side === other.side && target.line === other.line;
}

test("two comments are in one thread only if they're on the same line of the same file", () => {
  fc.assert(
    fc.property(commentTarget, commentTarget, (target, other) => {
      const threads = threadsOf([
        { ...target, id: 1, body: "" },
        { ...other, id: 2, body: "" },
      ]);

      expect(threads.size === 1).toBe(sameTarget(target, other));
    }),
  );
});

// Whether the comments are all on one line, and in the order they were made among the comments.
function oneLineInOrder(
  thread: readonly ReviewComment[],
  comments: readonly ReviewComment[],
): boolean {
  const places = thread.map((each) => comments.indexOf(each));

  return (
    thread.every((each) => thread[0] !== undefined && sameTarget(each, thread[0])) &&
    places.every((place, at) => place > (places[at - 1] ?? -1))
  );
}

// Whether no two of the threads are on the same line.
function apart(threads: readonly (readonly ReviewComment[])[]): boolean {
  const firsts = threads.flatMap((thread) => thread.slice(0, 1));

  return firsts.every((first) => firsts.filter((other) => sameTarget(first, other)).length === 1);
}

function byId(comments: readonly ReviewComment[]): ReviewComment[] {
  return comments.toSorted((comment, other) => comment.id - other.id);
}

test("each comment is in the thread of the line it's on, in the order they were made, and in no other", () => {
  fc.assert(
    fc.property(reviewComments, (comments) => {
      const threads = [...threadsOf(comments).values()];

      expect(byId(threads.flat())).toStrictEqual(byId(comments));
      expect(threads.every((thread) => oneLineInOrder(thread, comments))).toBe(true);
      expect(apart(threads)).toBe(true);
    }),
  );
});

// The comment being written, if any, as a new comment, or as an edit of one of the comments, which
// may not be on it, and which of the targets of the line under which it's looked for it's on, if any,
// as it often is.
const editing = fc.tuple(
  fc.option(
    fc.record({
      target: commentTarget,
      id: fc.option(fc.nat(20), { nil: undefined }),
      where: fc.constantFrom("line", "list"),
    }),
    { nil: undefined },
  ),
  fc.option(fc.nat(1), { nil: undefined }),
);

// The comment being written, moved to the one of the targets it's on, if it's on one.
function writtenOn(
  [written, on]: [Editing | undefined, number | undefined],
  targets: readonly CommentTarget[],
): Editing | undefined {
  const target = on === undefined ? undefined : targets[on % targets.length];

  return written !== undefined && target !== undefined ? { ...written, target } : written;
}

type Parts = [ReviewComment[], (Editing | undefined)[]] | "nothing";

// What shows under the line whose comments are on the targets, as each of its parts: the comments on
// any of them, and the one being written under it on any of them. Nothing where neither is.
function shownAt(
  comments: readonly ReviewComment[],
  written: Editing | undefined,
  targets: readonly CommentTarget[],
): Parts {
  const on = comments.filter((each) => targets.some((target) => sameTarget(each, target)));

  const writing = [written].filter(
    (each) => each?.where === "line" && targets.some((target) => sameTarget(each.target, target)),
  );

  return on.length + writing.length === 0 ? "nothing" : [on, writing];
}

// The parts of what shows under a line, if anything does.
function partsOf(thread: ReturnType<typeof threadAt>): Parts {
  return thread === undefined
    ? "nothing"
    : [[...thread.comments], [thread.editing].filter(Boolean)];
}

// The targets a line's comments are on: one, or two, as an unchanged line's are inline.
const targets = fc.uniqueArray(commentTarget, {
  minLength: 1,
  maxLength: 2,
  selector: (target) => JSON.stringify(target),
});

test("under a line shows the comments on it, in the order they were made, and the comment being written under it, if any", () => {
  fc.assert(
    fc.property(reviewComments, editing, targets, (comments, writing, on) => {
      const written = writtenOn(writing, on);
      const thread = threadAt(threadsOf(comments), written, on);

      expect(partsOf(thread)).toStrictEqual(shownAt(comments, written, on));
    }),
  );
});

test("inline, an unchanged line shows the comments on its old number and its new one together, in the order they were made", () => {
  const onNew = { path, side: "new", line: 5 } as const;
  const onOld = { path, side: "old", line: 2 } as const;

  const comments = [
    { ...onNew, id: 1, body: "First" },
    { ...onOld, id: 2, body: "Second" },
    { ...onNew, id: 3, body: "Third" },
  ];

  expect(
    threadAt(threadsOf(comments), undefined, shownOn(file, unchanged))?.comments.map(
      ({ body }) => body,
    ),
  ).toStrictEqual(["First", "Second", "Third"]);
});

test("a comment is edited where it was started: under its line, or in the review's list", () => {
  const target = { path, side: "new", line: 3 } as const;

  expect(editedIn({ target, id: 2, where: "list" }, 2, "list")).toBe(true);
  expect(editedIn({ target, id: 2, where: "line" }, 2, "list")).toBe(false);
  expect(editedIn({ target, id: 3, where: "list" }, 2, "list")).toBe(false);
  expect(editedIn({ target, id: undefined, where: "line" }, 2, "line")).toBe(false);
  expect(editedIn(undefined, 2, "line")).toBe(false);
});
