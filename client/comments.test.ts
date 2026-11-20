import * as fc from "fast-check";
import { expect, test } from "vitest";

import { bodyOf, changedBy } from "../shared/review";
import {
  asNumbered,
  commentBody,
  commentTarget,
  keptComment,
  reviewComments,
  savedIn,
  withoutId,
} from "../test/comments";
import { rangeLabel, rangeNumbers, rangeOf, saved, targetOf } from "./comments";
import type { CommentTarget, ReviewComment } from "./comments";
import type { NumberedLine } from "./lines";

const file = { path: "a.txt", numbering: asNumbered };

// The comments once the one with the id is deleted.
function without(comments: readonly ReviewComment[], id: number): ReviewComment[] {
  return changedBy({ comments: [...comments], message: "" }, [{ kind: "delete", id }]).comments;
}

// The comments once those sent are.
function unsent(
  comments: readonly ReviewComment[],
  sent: readonly ReviewComment[],
): ReviewComment[] {
  return changedBy({ comments: [...comments], message: "" }, [
    { kind: "sent", comments: [...sent] },
  ]).comments;
}

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

test("inline, a comment on a removed line is on its old number, and on any other line on its new one", () => {
  expect([removed, added, unchanged].map((line) => targetOf(file, line))).toStrictEqual([
    { path: "a.txt", side: "old", line: 3 },
    { path: "a.txt", side: "new", line: 4 },
    { path: "a.txt", side: "new", line: 5 },
  ]);
});

test("side by side, a comment is on the number the side shows the line with, and on none where it doesn't show it", () => {
  expect(
    (["old", "new"] as const).flatMap((side) =>
      [removed, added, unchanged].map((line) => targetOf(file, line, side)),
    ),
  ).toStrictEqual([
    { path: "a.txt", side: "old", line: 3 },
    undefined,
    { path: "a.txt", side: "old", line: 2 },
    undefined,
    { path: "a.txt", side: "new", line: 4 },
    { path: "a.txt", side: "new", line: 5 },
  ]);
});

test("a comment on several lines is on the last, from the first, and one on a line from itself only on it", () => {
  const first: CommentTarget = { path: "a.txt", side: "old", line: 4 };
  const last: CommentTarget = { path: "a.txt", side: "new", line: 7 };

  expect(rangeOf(first, last)).toStrictEqual({ ...last, start: { side: "old", line: 4 } });
  expect(rangeOf({ ...first, side: "new" }, last)).toStrictEqual({
    ...last,
    start: { side: "new", line: 4 },
  });
  expect(rangeOf({ ...first, line: 7 }, last)).toStrictEqual({
    ...last,
    start: { side: "old", line: 7 },
  });
  expect(rangeOf(last, last)).toBe(last);
});

test("a comment on several lines keeps what tells each of the first and the last apart", () => {
  const first: CommentTarget = {
    path: "a.txt",
    side: "old",
    line: 4,
    anchor: { text: "four", before: ["three"], after: [] },
  };

  const last: CommentTarget = {
    path: "a.txt",
    side: "new",
    line: 7,
    anchor: { text: "seven", before: [], after: ["eight"] },
  };

  expect(rangeOf(first, last)).toStrictEqual({
    ...last,
    start: { side: "old", line: 4, anchor: first.anchor },
  });
});

test("a comment on several lines says which they are, as Linear does", () => {
  const last: CommentTarget = { path: "a.txt", side: "new", line: 51 };

  expect(rangeLabel({ ...last, start: { side: "new", line: 45 } })).toBe("Lines 45\u201351");
  expect(rangeNumbers({ ...last, start: { side: "new", line: 45 } })).toBe("45\u201351");
  expect(rangeLabel(last)).toBeUndefined();
  expect(rangeNumbers(last)).toBeUndefined();
});

test("a comment on lines on different sides says which side each of the first and last is on, as GitHub does", () => {
  const last: CommentTarget = { path: "a.txt", side: "new", line: 51 };

  expect(rangeLabel({ ...last, start: { side: "old", line: 44 } })).toBe("Lines \u221244 to +51");
  expect(rangeLabel({ ...last, side: "old", start: { side: "new", line: 44 } })).toBe(
    "Lines +44 to \u221251",
  );
});

test("a comment kept on several lines reads back on them, with what tells each apart, and one kept from before comments could be is on one line, and one from before they had anchors on its lines as numbered", () => {
  const kept = { path: "a.txt", side: "new", line: 3, id: 1, body: "Why?" };
  const onSeveral = { ...kept, start: { side: "old", line: 2 } };
  const anchor = { text: "b", before: ["a"], after: ["c", "d"] };

  const anchored = {
    ...kept,
    anchor,
    start: { side: "old", line: 2, anchor: { ...anchor, text: "z" } },
  };

  expect(keptComment.parse(onSeveral)).toStrictEqual(onSeveral);
  expect(keptComment.parse(kept)).toStrictEqual(kept);
  expect(keptComment.parse(anchored)).toStrictEqual(anchored);
  expect(keptComment.safeParse({ ...kept, start: { side: "old", line: 0 } }).success).toBe(false);
  expect(keptComment.safeParse({ ...kept, anchor: { text: "b" } }).success).toBe(false);
});

test("a comment says what's written, without whitespace at either end, and nothing is kept if it's only whitespace", () => {
  expect(bodyOf("  Rename this\r\n\tplease  \n")).toBe("Rename this\r\n\tplease");
  expect(bodyOf("😀")).toBe("😀");
  expect(bodyOf(" \r\n\t ")).toBeUndefined();
  expect(bodyOf("")).toBeUndefined();
});

// What a comment says that has no whitespace at either end, which saving keeps as it is.
const kept = commentBody.map((body) => `[${body}]`);

test("a comment saved on a line comes after the others, as written, on its line, with an id none of them has", () => {
  fc.assert(
    fc.property(reviewComments, commentTarget, kept, (comments, target, body) => {
      const made = savedIn(comments, { target, id: undefined }, body);

      expect(made.slice(0, -1)).toStrictEqual(comments);
      expect(made.slice(-1)).toMatchObject([{ ...target, body }]);
      expect(new Set(made.map(({ id }) => id)).size).toBe(made.length);
      expect(made.every((each) => keptComment.safeParse(each).success)).toBe(true);
    }),
  );
});

const comment: ReviewComment = { path: "a.txt", side: "new", line: 3, id: 2, body: "Why?" };

test("a comment saved on several lines is on them", () => {
  const target: CommentTarget = {
    path: "a.txt",
    side: "new",
    line: 5,
    start: { side: "new", line: 2 },
  };

  expect(savedIn([comment], { target, id: undefined }, "Why?").map(withoutId)).toStrictEqual([
    withoutId(comment),
    { ...target, body: "Why?" },
  ]);
});

test("a comment saved on the line of one edited is only what it says, on the line", () => {
  expect(
    savedIn([comment], { target: comment, id: undefined }, "And?").map(withoutId),
  ).toStrictEqual([withoutId(comment), { path: "a.txt", side: "new", line: 3, body: "And?" }]);
});

test("saving what's written makes a new comment on its line, or changes what the comment edited says, without whitespace at either end", () => {
  const target: CommentTarget = { path: "a.txt", side: "old", line: 1 };

  expect(
    savedIn([comment], { target, id: undefined }, "  Rename this\n").map(withoutId),
  ).toStrictEqual([withoutId(comment), { ...target, body: "Rename this" }]);
  expect(savedIn([comment], { target: comment, id: 2 }, "\tWhy not?  ")).toStrictEqual([
    { ...comment, body: "Why not?" },
  ]);
});

// The id of one of the comments, by any index, or one none has if there are none, and the comments
// with that one replaced by the others.
function picked(
  comments: readonly ReviewComment[],
  at: number,
  replaced: (comment: ReviewComment) => ReviewComment[],
): { id: number; replaced: ReviewComment[] } {
  const index = at % Math.max(1, comments.length);
  const each = comments[index];

  return each === undefined
    ? { id: 0, replaced: [] }
    : { id: each.id, replaced: comments.toSpliced(index, 1, ...replaced(each)) };
}

test("editing a comment changes what it says, and nothing else of it or the others", () => {
  fc.assert(
    fc.property(reviewComments, commentTarget, fc.nat(), kept, (comments, target, at, body) => {
      const { id, replaced } = picked(comments, at, (each) => [{ ...each, body }]);

      expect(savedIn(comments, { target, id }, body)).toStrictEqual(replaced);
    }),
  );
});

// Comments, and one of them.
const oneOfSome = reviewComments
  .filter((comments) => comments.length > 0)
  .chain((comments) => fc.constantFrom(...comments).map((each) => ({ comments, each })));

test("an edit is saved to a comment that still says what it said as the edit started, and not to one that says something else by then, as one another view has edited, or made since with its id", () => {
  fc.assert(
    fc.property(oneOfSome, kept, commentBody, ({ comments, each }, body, since) => {
      const index = comments.indexOf(each);
      const edit = { target: each, id: each.id, said: each.body };
      const edited = comments.toSpliced(index, 1, { ...each, body: `${each.body}${since}!` });

      expect(savedIn(comments, edit, body)).toStrictEqual(
        comments.toSpliced(index, 1, { ...each, body }),
      );
      expect(savedIn(edited, edit, body)).toStrictEqual(edited);
      expect(savedIn(without(comments, each.id), edit, body)).toStrictEqual(
        without(comments, each.id),
      );
    }),
  );
});

test("deleting a comment leaves the others as they were", () => {
  fc.assert(
    fc.property(reviewComments, fc.nat(), (comments, at) => {
      const { id, replaced } = picked(comments, at, () => []);

      expect(without(comments, id)).toStrictEqual(replaced);
    }),
  );
});

// Text that's only whitespace, of every kind a comment can be written with.
const whitespace = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r", " "))
  .map((units) => units.join(""));

test("saving only whitespace changes nothing", () => {
  fc.assert(
    fc.property(
      reviewComments,
      commentTarget,
      fc.nat(),
      whitespace,
      (comments, target, at, text) => {
        const { id } = picked(comments, at, () => []);

        expect(saved(comments, { target, id: undefined }, text)).toBeUndefined();
        expect(saved(comments, { target, id }, text)).toBeUndefined();
      },
    ),
  );
});

// The comments sent, with those at the indices edited to say the body, where that changes them, and
// those made after them.
function changedSince(
  sent: readonly ReviewComment[],
  edits: readonly number[],
  edit: string,
  made: readonly [CommentTarget, string][],
): readonly ReviewComment[] {
  let comments: readonly ReviewComment[] = sent;

  for (const at of edits) {
    const edited = sent[at];

    if (edited !== undefined && edited.body !== edit) {
      comments = savedIn(comments, { target: edited, id: edited.id }, edit);
    }
  }

  for (const [target, body] of made) {
    comments = savedIn(comments, { target, id: undefined }, body);
  }

  return comments;
}

test("once comments are sent, those made or edited while they were sent are still pending", () => {
  fc.assert(
    fc.property(
      reviewComments,
      fc.subarray([0, 1, 2, 3, 4, 5, 6, 7]),
      kept,
      fc.array(fc.tuple(commentTarget, kept), { maxLength: 2 }),
      (sent, edits, edit, made) => {
        const now = changedSince(sent, edits, edit, made);

        const pending = now.filter((each) => !sent.includes(each));

        expect(unsent(now, sent)).toStrictEqual(pending);
        // As once any of them changes, or another view changes them, each is read anew.
        expect(unsent(structuredClone(now), sent)).toStrictEqual(pending);
      },
    ),
  );
});

test("a comment made while others were sent stays pending, though it says what one of them did", () => {
  const made = savedIn([comment], { target: comment, id: undefined }, comment.body);

  expect(unsent(made, [comment])).toStrictEqual(made.slice(1));
  expect(made.slice(1).map(withoutId)).toStrictEqual([withoutId(comment)]);
});

test("a comment made while others were sent stays pending, though it has the id of one deleted then and says what it did, on another line", () => {
  const first = { ...comment, id: 1 };
  const sent = [first, comment];
  const target = { ...comment, line: comment.line + 1 };

  expect(unsent([first, target], sent)).toStrictEqual([target]);
});

test("comments deleted while they were sent stay deleted", () => {
  fc.assert(
    fc.property(reviewComments, fc.nat(), (sent, at) => {
      expect(unsent(without(sent, picked(sent, at, () => []).id), sent)).toStrictEqual([]);
    }),
  );
});
