import * as fc from "fast-check";
import { expect, test } from "vitest";
import { z } from "zod";

import { changedBy } from "../shared/review";
import type { ReviewChange } from "../shared/review";
import { keptComment, reviewComments, savedIn } from "../test/comments";
import { restored, saved } from "./comments";
import type { CommentTarget, ReviewComment } from "./comments";

const target: CommentTarget = { path: "a.txt", side: "old", line: 1 };

// What a comment's id is picked with, as Math.random picks it: a number from 0 up to 1.
const pickedNumber = fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true });

// What picks the numbers in turn, and then 0.
function picking(numbers: readonly number[]): () => number {
  const left = [...numbers];

  return () => left.shift() ?? 0;
}

// Comments whose ids are any, up to far more than the comments made one after another on a
// workspace would have, in the order of their ids.
const madeBefore = fc
  .uniqueArray(fc.integer({ min: 1, max: 2 ** 40 }), { maxLength: 4 })
  .map((ids) =>
    ids
      .toSorted((id, other) => id - other)
      .map((id): ReviewComment => ({ path: "a.txt", side: "new", line: 3, id, body: "Why?" })),
  );

// The comments the change makes pending, as one that saves or restores them.
function madeBy(change: ReviewChange | undefined): ReviewComment[] {
  if (change?.kind === "add") {
    return [change.comment];
  }

  if (change?.kind === "restore") {
    return change.comments;
  }

  throw new Error("The change makes no comments.");
}

// Whether each id is greater than the one before it.
function increasing(comments: readonly ReviewComment[]): boolean {
  return comments.every((comment, at) => at === 0 || comment.id > (comments[at - 1]?.id ?? 0));
}

test("a comment saved has an id greater than those of the comments made before it, whichever client made them, and one a comment can be kept with", () => {
  fc.assert(
    fc.property(
      madeBefore,
      fc.array(pickedNumber, { minLength: 1, maxLength: 4 }),
      (before, numbers) => {
        let made: readonly ReviewComment[] = before;
        const ids: ReviewComment[] = [...before];

        for (const number of numbers) {
          ids.push(...madeBy(saved(made, { target, id: undefined }, "And?", () => number)));
          made = savedIn(made, { target, id: undefined }, "And?", () => number);
        }

        expect(increasing(ids)).toBe(true);
        expect(z.array(keptComment).safeParse(made).success).toBe(true);
      },
    ),
    {
      examples: [
        [[{ path: "a.txt", side: "new", line: 3, id: 2 ** 21 - 1, body: "Why?" }], [0.9999]],
      ],
    },
  );
});

test("comments saved at the same moment on two clients that have the same comments have different ids, but once in a million", () => {
  fc.assert(
    fc.property(
      reviewComments,
      fc.uniqueArray(fc.integer({ min: 0, max: 1_048_575 }), { minLength: 2, maxLength: 2 }),
      (comments, picks) => {
        const ids = picks.map(
          (pick) =>
            savedIn(comments, { target, id: undefined }, "Why?", () => pick / 1_048_576).at(-1)?.id,
        );

        expect(new Set(ids).size).toBe(2);
      },
    ),
  );
});

test("comments restored have ids greater than those pending, and than each other's before them, and ones comments can be kept with", () => {
  fc.assert(
    fc.property(madeBefore, reviewComments, fc.array(pickedNumber), (pending, sent, numbers) => {
      const change = restored(pending, { comments: sent, message: "" }, picking(numbers));
      const { comments } = changedBy({ comments: pending, message: "" }, [change]);

      expect(increasing([...pending, ...madeBy(change)])).toBe(true);
      expect(z.array(keptComment).safeParse(comments).success).toBe(true);
    }),
    {
      examples: [
        [
          [{ path: "a.txt", side: "new", line: 3, id: 2 ** 21 - 1, body: "Why?" }],
          [{ path: "a.txt", side: "new", line: 3, id: 1, body: "Why?" }],
          [0.9999],
        ],
      ],
    },
  );
});
