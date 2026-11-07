import * as fc from "fast-check";
import { expect, test } from "vitest";

import { commentBody, commentTarget, reviewComments } from "../test/comments";
import { bodyOf, reviewComment, saved, targetOf, unsent, without } from "./comments";
import type { CommentTarget, ReviewComment } from "./comments";
import type { NumberedLine } from "./lines";

const file = { diff: "unstaged", path: "a.txt" } as const;

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
    { ...file, side: "old", line: 3 },
    { ...file, side: "new", line: 4 },
    { ...file, side: "new", line: 5 },
  ]);
});

test("side by side, a comment is on the number the side shows the line with, and on none where it doesn't show it", () => {
  expect(
    (["old", "new"] as const).flatMap((side) =>
      [removed, added, unchanged].map((line) => targetOf(file, line, side)),
    ),
  ).toStrictEqual([
    { ...file, side: "old", line: 3 },
    undefined,
    { ...file, side: "old", line: 2 },
    undefined,
    { ...file, side: "new", line: 4 },
    { ...file, side: "new", line: 5 },
  ]);
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
      const made = saved(comments, { target, id: undefined }, body);

      expect(made.slice(0, -1)).toStrictEqual(comments);
      expect(made.slice(-1)).toMatchObject([{ ...target, body }]);
      expect(new Set(made.map(({ id }) => id)).size).toBe(made.length);
      expect(made.every((each) => reviewComment.safeParse(each).success)).toBe(true);
    }),
  );
});

const comment: ReviewComment = { ...file, side: "new", line: 3, id: 2, body: "Why?" };

test("the first comment has the id 1, and one saved on the line of one edited is only what it says, on the line", () => {
  const target: CommentTarget = { ...file, side: "new", line: 1 };

  expect(saved([], { target, id: undefined }, "Why?")).toStrictEqual([
    { ...target, id: 1, body: "Why?" },
  ]);
  expect(saved([comment], { target: comment, id: undefined }, "And?")).toStrictEqual([
    comment,
    { ...file, side: "new", line: 3, id: 3, body: "And?" },
  ]);
});

test("saving what's written makes a new comment on its line, or changes what the comment edited says, without whitespace at either end", () => {
  const target: CommentTarget = { ...file, side: "old", line: 1 };

  expect(saved([comment], { target, id: undefined }, "  Rename this\n")).toStrictEqual([
    comment,
    { ...target, id: 3, body: "Rename this" },
  ]);
  expect(saved([comment], { target: comment, id: 2 }, "\tWhy not?  ")).toStrictEqual([
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

      expect(saved(comments, { target, id }, body)).toStrictEqual(replaced);
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

        expect(saved(comments, { target, id: undefined }, text)).toBe(comments);
        expect(saved(comments, { target, id }, text)).toBe(comments);
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
      comments = saved(comments, { target: edited, id: edited.id }, edit);
    }
  }

  for (const [target, body] of made) {
    comments = saved(comments, { target, id: undefined }, body);
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

        expect(unsent(now, sent)).toStrictEqual(now.filter((each) => !sent.includes(each)));
      },
    ),
  );
});

test("a comment made while others were sent stays pending, though it says what one of them did", () => {
  const made = saved([comment], { target: comment, id: undefined }, comment.body);

  expect(unsent(made, [comment])).toStrictEqual([{ ...comment, id: 3 }]);
});

test("a comment made while others were sent stays pending, though it has the id of one deleted then and says what it did", () => {
  const first = { ...comment, id: 1 };
  const sent = [first, comment];
  const made = saved(without(sent, comment.id), { target: comment, id: undefined }, comment.body);

  expect(made).toStrictEqual(sent);
  expect(unsent(made, sent)).toStrictEqual([comment]);
});

test("comments deleted while they were sent stay deleted", () => {
  fc.assert(
    fc.property(reviewComments, fc.nat(), (sent, at) => {
      expect(unsent(without(sent, picked(sent, at, () => []).id), sent)).toStrictEqual([]);
    }),
  );
});
