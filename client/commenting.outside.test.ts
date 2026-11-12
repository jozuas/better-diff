import * as fc from "fast-check";
import { expect, test } from "vitest";

import { asNumbered, commentTarget, diffHunks, reviewComments } from "../test/comments";
import { commentedOn, commentedOutside } from "./commenting";
import { threadsOf } from "./comments";
import type { CommentTarget, Editing } from "./comments";
import type { NumberedLine } from "./lines";

const file = { path: "a.txt", numbering: asNumbered };

// Whether a line of the hunks is the target's line, on the target's side.
function isOn(line: NumberedLine, { side, line: number }: CommentTarget): boolean {
  return (side === "old" ? line.oldNumber : line.newNumber) === number;
}

// What's commented on under lines of the file: the comments' lines, and the comment's being written
// under a line, if one is.
function onFile(targets: readonly CommentTarget[], editing: Editing | undefined): CommentTarget[] {
  return [
    ...targets,
    ...[editing].flatMap((each) => (each?.where === "line" ? [each.target] : [])),
  ].filter(({ path }) => path === file.path);
}

// A comment being written, on a line or in the review's list, or none.
const editing = fc.option(
  fc.record({
    target: commentTarget,
    id: fc.option(fc.nat(20), { nil: undefined }),
    where: fc.constantFrom<Editing["where"]>("line", "list"),
  }),
  { nil: undefined },
);

test("a file's diff has a comment outside its hunks while a comment on the file, or one being written under a line of it, is on a line none of its hunks has", () => {
  fc.assert(
    fc.property(diffHunks, reviewComments, editing, ({ diff, numbered }, comments, written) => {
      const lines = numbered.flat();

      expect(commentedOutside(file, diff.hunks, threadsOf(comments), written)).toBe(
        onFile(comments, written).some((target) => !lines.some((line) => isOn(line, target))),
      );
    }),
  );
});

test("a line has comments under it while a comment's on it, on either side, or one's being written under it", () => {
  fc.assert(
    fc.property(diffHunks, reviewComments, editing, ({ numbered }, comments, written) => {
      const commented = commentedOn(file, threadsOf(comments), written);

      expect(numbered.flat().map(commented)).toStrictEqual(
        numbered
          .flat()
          .map((line) => onFile(comments, written).some((target) => isOn(line, target))),
      );
    }),
  );
});
