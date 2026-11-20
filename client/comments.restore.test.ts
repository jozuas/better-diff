import * as fc from "fast-check";
import { expect, test } from "vitest";
import { z } from "zod";

import { changedBy } from "../shared/review";
import { commentBody, keptComment, reviewComments, withoutId } from "../test/comments";
import { restored } from "./comments";
import type { ReviewComment } from "./comments";

// What a comment says of which lines, whatever its id.
function said(comment: ReviewComment): string {
  return JSON.stringify(withoutId(comment));
}

test("a review restored has its comments pending again, after those pending, in the order they were sent, each with an id greater than those before it, but for those that say what one pending says on the same lines", () => {
  fc.assert(
    fc.property(reviewComments, reviewComments, (pending, sent) => {
      const { comments } = changedBy({ comments: pending, message: "" }, [
        restored(pending, { comments: sent, message: "" }),
      ]);

      const ids = comments.map(({ id }) => id);
      const pendingSay = new Set(pending.map(said));

      expect(comments.slice(0, pending.length)).toStrictEqual(pending);
      expect(comments.slice(pending.length).map(withoutId)).toStrictEqual(
        sent.filter((comment) => !pendingSay.has(said(comment))).map(withoutId),
      );
      expect(ids).toStrictEqual(ids.toSorted((id, other) => id - other));
      expect(new Set(ids).size).toBe(comments.length);
      expect(z.array(keptComment).safeParse(comments).success).toBe(true);
    }),
  );
});

// A message that says nothing: whitespace, `\r` among it.
const blank = fc.string({ unit: fc.constantFrom(" ", "\n", "\r", "\t"), maxLength: 4 });

const saying = commentBody.filter((message) => message.trim() !== "");

test("a review restored has the message it was sent with again, while the review's message says nothing", () => {
  fc.assert(
    fc.property(blank, commentBody, (message, sent) => {
      expect(
        changedBy({ comments: [], message }, [restored([], { comments: [], message: sent })]),
      ).toStrictEqual({ comments: [], message: sent });
    }),
  );
});

test("a review restored keeps the review's message, while it says something", () => {
  fc.assert(
    fc.property(saying, commentBody, (message, sent) => {
      expect(
        changedBy({ comments: [], message }, [restored([], { comments: [], message: sent })]),
      ).toStrictEqual({ comments: [], message });
    }),
  );
});
