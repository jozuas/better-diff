import * as fc from "fast-check";
import { expect, test } from "vitest";

import { changedBy, reviewChange } from "../shared/review";
import { commentBody, commentTarget, reviewComments } from "../test/comments";
import { discarded, saved } from "./comments";
import type { ReviewComment } from "./comments";

const comment: ReviewComment = { path: "a.txt", side: "new", line: 3, id: 2, body: "Why?" };

const id = fc.option(fc.integer({ min: 1, max: 20 }), { nil: undefined });

// A comment being written: a new one, an edit, and an edit with what the comment said as it
// started.
const editing = fc.oneof(
  fc.record({ target: commentTarget, id }, { noNullPrototype: true }),
  fc.record({ target: commentTarget, id, said: commentBody }, { noNullPrototype: true }),
);

test("what saving changes is a change the plugin's server reads as it is, whether or not an edit has what the comment said as it started", () => {
  fc.assert(
    fc.property(reviewComments, editing, commentBody, (comments, written, text) => {
      const change = saved(comments, written, `[${text}]`);

      expect(reviewChange.parse(change)).toStrictEqual(change);
    }),
  );
});

test("discarding the review deletes the comments pending and empties the message, but leaves a comment another client made meanwhile", () => {
  fc.assert(
    fc.property(reviewComments, commentBody, (comments, message) => {
      const since = { ...comment, id: 99 };

      expect(
        changedBy({ comments: [...comments, since], message }, discarded(comments)),
      ).toStrictEqual({ comments: [since], message: "" });
    }),
  );
});
