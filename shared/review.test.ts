import * as fc from "fast-check";
import { expect, test } from "vitest";

import { commentBody, reviewChange, reviewComments } from "../test/comments";
import { changedBy, noReview, reviewChange as reviewChangeSchema } from "./review";
import type { ReviewComment } from "./review";

const comment: ReviewComment = { path: "a.txt", side: "new", line: 3, id: 2, body: "Why?" };

// Comments, and an id none of them has, which is often less than some of theirs.
const withFreeId = fc
  .tuple(reviewComments, fc.integer({ min: 1, max: 20 }))
  .filter(([comments, id]) => comments.every((each) => each.id !== id));

test("a comment made is pending among the others in the order of their ids", () => {
  fc.assert(
    fc.property(withFreeId, ([comments, id]) => {
      const made = { ...comment, id, body: "And?" };
      const after = changedBy({ comments, message: "" }, [{ kind: "add", comment: made }]);

      expect(after.comments).toStrictEqual(
        [...comments, made].toSorted((one, other) => one.id - other.id),
      );
    }),
  );
});

test("a review restored has its comments among those pending in the order of their ids, but for one with the id of one pending", () => {
  const pending = { ...comment, id: 5 };
  const earlier = { ...comment, id: 3, body: "Earlier." };
  const taken = { ...comment, id: 5, body: "Taken." };

  expect(
    changedBy({ comments: [pending], message: "" }, [
      { kind: "restore", comments: [taken, earlier], message: "" },
    ]).comments,
  ).toStrictEqual([earlier, pending]);
});

test("each change is one the plugin's server reads as it is", () => {
  fc.assert(
    fc.property(reviewChange, (change) => {
      expect(reviewChangeSchema.parse(change)).toStrictEqual(change);
    }),
  );
});

// Comments, and one of them.
const oneOfSome = reviewComments
  .filter((comments) => comments.length > 0)
  .chain((comments) => fc.constantFrom(...comments).map((each) => ({ comments, each })));

test("a comment made with the id of one pending changes nothing", () => {
  fc.assert(
    fc.property(oneOfSome, commentBody, ({ comments, each }, body) => {
      const review = { comments, message: "" };

      expect(
        changedBy(review, [{ kind: "add", comment: { ...comment, id: each.id, body } }]),
      ).toStrictEqual(review);
    }),
  );
});

test("a comment deleted is no longer pending, and the others stay as they were", () => {
  fc.assert(
    fc.property(reviewComments, fc.integer({ min: 1, max: 20 }), (comments, id) => {
      expect(changedBy({ comments, message: "Fix." }, [{ kind: "delete", id }])).toStrictEqual({
        comments: comments.filter((each) => each.id !== id),
        message: "Fix.",
      });
    }),
  );
});

test("the message typed takes the place of the review's, and so does one changed from what it said, while it still says it", () => {
  fc.assert(
    fc.property(commentBody, commentBody, (message, text) => {
      const review = { comments: [comment], message };
      const typed = { comments: [comment], message: text };

      expect(changedBy(review, [{ kind: "message", text }])).toStrictEqual(typed);
      expect(changedBy(review, [{ kind: "message", text, said: message }])).toStrictEqual(typed);
    }),
  );
});

test("a message changed from what it said changes nothing once it says something else", () => {
  fc.assert(
    fc.property(
      fc.tuple(commentBody, commentBody).filter(([message, said]) => message !== said),
      commentBody,
      ([message, said], text) => {
        const review = { comments: [comment], message };

        expect(changedBy(review, [{ kind: "message", text, said }])).toStrictEqual(review);
      },
    ),
  );
});

test("an edit of a comment none pending has, or that says something else, changes nothing", () => {
  const review = { comments: [comment], message: "" };

  expect(changedBy(review, [{ kind: "edit", id: 3, body: "And?" }])).toStrictEqual(review);
  expect(changedBy(review, [{ kind: "edit", id: 2, body: "And?", said: "How?" }])).toStrictEqual(
    review,
  );
  expect(changedBy(review, [{ kind: "edit", id: 2, body: "And?", said: "Why?" }])).toStrictEqual({
    comments: [{ ...comment, body: "And?" }],
    message: "",
  });
});

test("changes are made one after another, each on what those before it made", () => {
  fc.assert(
    fc.property(fc.array(reviewChange, { maxLength: 6 }), fc.nat(6), (changes, at) => {
      const first = changes.slice(0, at);

      expect(changedBy(changedBy(noReview, first), changes.slice(at))).toStrictEqual(
        changedBy(noReview, changes),
      );
    }),
  );
  expect(
    changedBy(noReview, [
      { kind: "add", comment },
      { kind: "delete", id: 2 },
    ]),
  ).toStrictEqual(noReview);
  expect(
    changedBy(noReview, [
      { kind: "delete", id: 2 },
      { kind: "add", comment },
    ]),
  ).toStrictEqual({ comments: [comment], message: "" });
});

test("making a change leaves the review it's made on as it was", () => {
  fc.assert(
    fc.property(reviewComments, commentBody, reviewChange, (comments, message, change) => {
      const review = { comments, message };
      const before = structuredClone(review);

      changedBy(review, [change]);

      expect(review).toStrictEqual(before);
    }),
  );
});
