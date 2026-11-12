import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { diffRpc } from "../shared/diff";
import { diffHunks, reviewComments } from "../test/comments";
import { contextOf, unchanged } from "../test/review";
import { reviewOf } from "./attachment";
import type { ReviewAttachment, Unsent } from "./attachment";
import { rangeLabel } from "./comments";
import type { ReviewComment } from "./comments";
import type { NumberedLine } from "./lines";
import type { CommentedFile } from "./numbering";

type Diff = RpcOutput<typeof diffRpc>;

// What a comment is sent saying: what it says, after which lines it's on, for one on several.
function sentBody(comment: ReviewComment): string {
  const lines = rangeLabel(comment);

  return lines === undefined ? comment.body : `${lines}: ${comment.body}`;
}

type Diffs = (path: string) => { diff: Diff; numbered: NumberedLine[][] } | undefined;

// What the review does with each comment, by the diffs on the side, and whether each file's other
// diff, which changes nothing, can be read: sends those on lines their diffs have, with the lines
// around them, and says why it doesn't send the others.
function reviewed(
  comments: readonly ReviewComment[],
  side: CommentedFile["diff"],
  diffs: Diffs,
  read: (path: string) => boolean,
): ({ comment: ReviewComment } & (
  | { sent: ReviewAttachment["comments"][number] }
  | { unsent: Unsent }
))[] {
  return comments.map((comment) => {
    const diff = diffs(comment.path)?.diff;

    if (diff === undefined || !read(comment.path)) {
      return { comment, unsent: "unread" };
    }

    const context = contextOf(diff, comment, side);

    return context === undefined
      ? { comment, unsent: "gone" }
      : {
          comment,
          sent: {
            filePath: comment.path,
            side: comment.side,
            lineNumber: comment.line,
            body: sentBody(comment),
            context,
          },
        };
  });
}

// The diffs of each file: on the side, those generated, which can't be read where there's none, and
// on the other, one that changes nothing, where it can be read.
function diffsOn(side: CommentedFile["diff"], diffs: Diffs, read: (path: string) => boolean) {
  return ({ diff, path }: CommentedFile) => {
    if (diff === side) {
      return diffs(path)?.diff;
    }

    return read(path) ? unchanged : undefined;
  };
}

// Each of the reviewed that's sent, or why each of the others isn't.
function sentOf(expected: ReturnType<typeof reviewed>) {
  return expected.flatMap((each) => ("sent" in each ? [each] : []));
}

// Where the comment's line is in the hunks of its file's diff, by the hunk's index and its own in
// it, where they have it.
function placeOf(diffs: Diffs, comment: ReviewComment): [number, number] {
  const numbered = diffs(comment.path)?.numbered ?? [];

  for (const [hunk, lines] of numbered.entries()) {
    const at = lines.findIndex(
      (line) => (comment.side === "old" ? line.oldNumber : line.newNumber) === comment.line,
    );

    if (at !== -1) {
      return [hunk, at];
    }
  }

  return [Infinity, Infinity];
}

// The comments in the order the review lists them: by path, and each file's in the order of their
// lines, those on one line in the order they were made.
function inListedOrder<Each extends { comment: ReviewComment }>(
  each: readonly Each[],
  diffs: Diffs,
): Each[] {
  return each.toSorted(({ comment }, { comment: other }) => {
    if (comment.path !== other.path) {
      return comment.path < other.path ? -1 : 1;
    }

    const [hunk, at] = placeOf(diffs, comment);
    const [otherHunk, otherAt] = placeOf(diffs, other);

    return hunk === otherHunk ? at - otherAt : hunk - otherHunk;
  });
}

// The comments an attachment has, or none without one.
function attachedOf({ attachment }: ReturnType<typeof reviewOf>): ReviewAttachment["comments"] {
  return attachment?.comments ?? [];
}

function unsentOf(expected: ReturnType<typeof reviewed>): Unsent[] {
  return expected.flatMap((each) => ("unsent" in each ? [each.unsent] : []));
}

test("a review has the comments on lines their diffs have, in the order the review lists them, each with the lines around it, and says why it hasn't the others", () => {
  fc.assert(
    fc.property(
      reviewComments,
      fc.constantFrom("unstaged", "staged"),
      fc.func(fc.option(diffHunks, { nil: undefined })),
      fc.func(fc.boolean()),
      (comments, side, diffs, read) => {
        const review = reviewOf("/repository", comments, diffsOn(side, diffs, read));
        const expected = reviewed(comments, side, diffs, read);
        const sent = inListedOrder(sentOf(expected), diffs);

        expect(review.sent).toStrictEqual(sent.map(({ comment }) => comment));
        expect(attachedOf(review)).toStrictEqual(sent.map((each) => each.sent));
        expect(review.unsent.toSorted()).toStrictEqual(unsentOf(expected).toSorted());
      },
    ),
  );
});
