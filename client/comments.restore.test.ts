import * as fc from "fast-check";
import { expect, test } from "vitest";
import { z } from "zod";

import { commentBody, reviewComments } from "../test/comments";
import { restoredComments, restoredMessage, reviewComment } from "./comments";
import type { ReviewComment } from "./comments";

// What a comment is but its id.
function withoutId({ id: _id, ...comment }: ReviewComment): Omit<ReviewComment, "id"> {
  return comment;
}

test("a review restored has its comments pending again, after those pending, in the order they were sent, each with an id none of the others has", () => {
  fc.assert(
    fc.property(reviewComments, reviewComments, (pending, sent) => {
      const restored = restoredComments(pending, { comments: sent, message: "" });

      expect(restored.slice(0, pending.length)).toStrictEqual(pending);
      expect(restored.slice(pending.length).map(withoutId)).toStrictEqual(sent.map(withoutId));
      expect(new Set(restored.map(({ id }) => id)).size).toBe(restored.length);
      expect(z.array(reviewComment).safeParse(restored).success).toBe(true);
    }),
  );
});

// A message that says nothing: whitespace, `\r` among it.
const blank = fc.string({ unit: fc.constantFrom(" ", "\n", "\r", "\t"), maxLength: 4 });

const saying = commentBody.filter((message) => message.trim() !== "");

test("a review restored has the message it was sent with again, while the review's message says nothing", () => {
  fc.assert(
    fc.property(blank, commentBody, (message, sent) => {
      expect(restoredMessage(message, { comments: [], message: sent })).toBe(sent);
    }),
  );
});

test("a review restored keeps the review's message, while it says something", () => {
  fc.assert(
    fc.property(saying, commentBody, (message, sent) => {
      expect(restoredMessage(message, { comments: [], message: sent })).toBe(message);
    }),
  );
});
