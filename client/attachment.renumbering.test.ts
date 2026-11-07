import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { diffRpc } from "../shared/diff";
import { partlyStaged } from "../test/comments";
import { placementOf, reviewOf } from "./attachment";
import type { Placement } from "./attachment";
import { targetOf } from "./comments";
import type { CommentTarget, ReviewComment } from "./comments";
import { numberLines } from "./lines";
import type { NumberedLine } from "./lines";

type Diff = RpcOutput<typeof diffRpc>;

const file = { diff: "unstaged", path: "a.txt" } as const;

const kinds = { " ": "context", "-": "removed", "+": "added" } as const;

function isSign(sign: string): sign is keyof typeof kinds {
  return Object.hasOwn(kinds, sign);
}

// The kind of line the line written is: " " starts an unchanged line, "-" a removed one and "+" an
// added one.
function kindOf(written: string): Diff["hunks"][number]["lines"][number]["kind"] {
  const sign = written.slice(0, 1);

  return isSign(sign) ? kinds[sign] : "context";
}

// A hunk of the lines, each of the kind and with the text it's written with.
function hunk(oldStart: number, newStart: number, written: readonly string[]) {
  return {
    oldStart,
    newStart,
    lines: written.map((line) => ({
      kind: kindOf(line),
      text: line.slice(1),
      newline: true,
      runs: [],
    })),
  };
}

// The context a comment is sent with, by the file's diffs.
function sentWithin(
  diffs: Record<CommentTarget["diff"], Pick<Diff, "hunks">>,
  target: CommentTarget,
) {
  const review = reviewOf(
    "/repository",
    [{ ...target, id: 1, body: "" }],
    ({ diff }) => diffs[diff],
  );

  const sent = review.attachment?.comments[0];

  return sent === undefined
    ? review.unsent
    : { side: sent.side, lineNumber: sent.lineNumber, context: sent.context };
}

test("a comment on a partly staged file is numbered as HEAD and the worktree number its line, and so are the lines around it", () => {
  // HEAD has one to ten, the index zero before them, and the worktree minus before that, and nine
  // as NINE.
  const diffs = {
    staged: { hunks: [hunk(1, 1, ["+zero", " one", " two", " three"])] },
    unstaged: {
      hunks: [
        hunk(1, 1, ["+minus", " zero", " one", " two"]),
        hunk(7, 8, [" six", " seven", " eight", "-nine", "+NINE", " ten"]),
      ],
    },
  };

  expect(sentWithin(diffs, { ...file, side: "old", line: 10 })).toStrictEqual({
    side: "old",
    lineNumber: 9,
    context: {
      hunkHeader: "@@ -6,5 +8,5 @@",
      targetLine: { oldLineNumber: 9, newLineNumber: null, type: "remove", content: "nine" },
      lines: [
        { oldLineNumber: 6, newLineNumber: 8, type: "context", content: "six" },
        { oldLineNumber: 7, newLineNumber: 9, type: "context", content: "seven" },
        { oldLineNumber: 8, newLineNumber: 10, type: "context", content: "eight" },
        { oldLineNumber: 9, newLineNumber: null, type: "remove", content: "nine" },
        { oldLineNumber: null, newLineNumber: 11, type: "add", content: "NINE" },
        { oldLineNumber: 10, newLineNumber: 12, type: "context", content: "ten" },
      ],
    },
  });
  expect(sentWithin(diffs, { diff: "staged", path: "a.txt", side: "new", line: 1 })).toStrictEqual({
    side: "new",
    lineNumber: 2,
    context: {
      hunkHeader: "@@ -1,3 +2,4 @@",
      targetLine: { oldLineNumber: null, newLineNumber: 2, type: "add", content: "zero" },
      lines: [
        { oldLineNumber: null, newLineNumber: 2, type: "add", content: "zero" },
        { oldLineNumber: 1, newLineNumber: 3, type: "context", content: "one" },
        { oldLineNumber: 2, newLineNumber: 4, type: "context", content: "two" },
        { oldLineNumber: 3, newLineNumber: 5, type: "context", content: "three" },
      ],
    },
  });
});

test("a comment on a line only the index has, staged and then changed in the worktree, isn't sent", () => {
  // HEAD has two, the index TWO, and the worktree Two.
  const diffs = {
    staged: { hunks: [hunk(1, 1, [" one", "-two", "+TWO", " three"])] },
    unstaged: { hunks: [hunk(1, 1, [" one", "-TWO", "+Two", " three"])] },
  };

  expect(sentWithin(diffs, { diff: "staged", path: "a.txt", side: "new", line: 2 })).toStrictEqual([
    "changed",
  ]);
  expect(sentWithin(diffs, { ...file, side: "old", line: 2 })).toStrictEqual(["changed"]);
  expect(sentWithin(diffs, { diff: "staged", path: "a.txt", side: "old", line: 2 })).toMatchObject({
    side: "old",
    lineNumber: 2,
  });
  expect(sentWithin(diffs, { ...file, side: "new", line: 2 })).toMatchObject({
    side: "new",
    lineNumber: 2,
  });
});

test("a comment on the side of an unchanged line that the review's version of that side hasn't is sent on the other side", () => {
  // HEAD has a and b, the index X between them, and the worktree Y after b.
  const diffs = {
    staged: { hunks: [hunk(1, 1, [" a", "+X", " b"])] },
    unstaged: { hunks: [hunk(1, 1, [" a", " X", " b", "+Y"])] },
  };

  expect(sentWithin(diffs, { ...file, side: "old", line: 2 })).toMatchObject({
    side: "new",
    lineNumber: 2,
    context: { hunkHeader: "@@ -1,2 +1,4 @@" },
  });
  expect(sentWithin(diffs, { ...file, side: "old", line: 1 })).toMatchObject({
    side: "old",
    lineNumber: 1,
  });
});

test("a hunk with lines only on one side starts after the line before it, as the review numbers that line", () => {
  // HEAD has a, b and c, the index X before them, and the worktree Y after them.
  const diffs = {
    staged: { hunks: [hunk(0, 1, ["+X"])] },
    unstaged: { hunks: [hunk(4, 5, ["+Y"])] },
  };

  expect(sentWithin(diffs, { ...file, side: "new", line: 5 })).toMatchObject({
    side: "new",
    lineNumber: 5,
    context: { hunkHeader: "@@ -3,0 +5 @@" },
  });
});

test("a hunk without a line HEAD has is said to be after the last line before it that HEAD has", () => {
  // HEAD has a, the index P, Q, R, S, X and Z after it, and the worktree Y after X.
  const diffs = {
    staged: { hunks: [hunk(1, 1, [" a", "+P", "+Q", "+R", "+S", "+X", "+Z"])] },
    unstaged: { hunks: [hunk(4, 4, [" R", " S", " X", "+Y", " Z"])] },
  };

  expect(sentWithin(diffs, { ...file, side: "new", line: 7 })).toMatchObject({
    context: { hunkHeader: "@@ -1,0 +4,5 @@" },
  });

  // HEAD hasn't the file, the index has X and Z, and the worktree Y between them.
  const added = {
    staged: { hunks: [hunk(0, 1, ["+X", "+Z"])] },
    unstaged: { hunks: [hunk(1, 1, [" X", "+Y", " Z"])] },
  };

  expect(sentWithin(added, { ...file, side: "new", line: 2 })).toMatchObject({
    context: { hunkHeader: "@@ -0,0 +1,3 @@" },
  });
});

type Diffs = Record<CommentTarget["diff"], Pick<Diff, "hunks">>;

// A comment on each line each diff shows, inline and on each side side by side, and its line.
function commentsOn(diffs: Diffs): { comment: ReviewComment; line: NumberedLine }[] {
  return (["unstaged", "staged"] as const).flatMap((diff) =>
    diffs[diff].hunks.flatMap((each) =>
      numberLines(each).flatMap((line) =>
        [undefined, "old" as const, "new" as const].flatMap((side) => {
          const target = targetOf({ diff, path: "a.txt" }, line, side);

          return target === undefined ? [] : [{ comment: { ...target, id: 1, body: "" }, line }];
        }),
      ),
    ),
  );
}

interface Versions {
  head: readonly string[];
  worktree: readonly string[];
}

const opposite = { old: "new", new: "old" } as const;

// Where the review has a comment on the line, by the versions: on the line of HEAD, for the old
// side, or of the worktree, for the new one, that's the same line, or for an unchanged line that
// the side's version hasn't, the other side's. Changed, for a line only the index has.
function expectedAt(
  comment: ReviewComment,
  line: NumberedLine,
  { head, worktree }: Versions,
): { side: "old" | "new"; lineNumber: number } | "changed" {
  const sides = line.kind === "context" ? [comment.side, opposite[comment.side]] : [comment.side];

  const found = sides.flatMap((side) => {
    const at = (side === "old" ? head : worktree).indexOf(line.text);

    return at === -1 ? [] : [{ side, lineNumber: at + 1 }];
  });

  return found[0] ?? "changed";
}

function sentAt(placement: Placement) {
  return "sent" in placement
    ? { side: placement.sent.side, lineNumber: placement.sent.lineNumber }
    : placement.unsent;
}

// The lines the review sends a comment with whose numbers aren't those of the lines of HEAD and the
// worktree that say what they say.
function misnumbered(placement: Placement, { head, worktree }: Versions): unknown[] {
  const lines = "sent" in placement ? placement.sent.context.lines : [];

  return lines.filter(
    ({ oldLineNumber, newLineNumber, content }) =>
      (oldLineNumber !== null && head[oldLineNumber - 1] !== content) ||
      (newLineNumber !== null && worktree[newLineNumber - 1] !== content),
  );
}

test("a comment on a partly staged file is sent on the line of HEAD or the worktree that its line is, and so are the lines around it, unless only the index has its line", () => {
  fc.assert(
    fc.property(partlyStaged, ({ versions, diffs }) => {
      const comments = commentsOn(diffs);

      const placements = comments.map(({ comment }) =>
        placementOf(comment, ({ diff }) => diffs[diff]),
      );

      expect(placements.map(sentAt)).toStrictEqual(
        comments.map(({ comment, line }) => expectedAt(comment, line, versions)),
      );
      expect(placements.flatMap((placement) => misnumbered(placement, versions))).toStrictEqual([]);
    }),
  );
});
