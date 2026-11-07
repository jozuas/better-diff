import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { diffRpc } from "../shared/diff";
import { partlyStaged, restaged } from "../test/comments";
import { placementOf, reviewOf } from "./attachment";
import type { Placement } from "./attachment";
import { shownOn, targetOf } from "./comments";
import type { CommentTarget, ReviewComment } from "./comments";
import { numberLines } from "./lines";
import type { NumberedLine } from "./lines";
import { numberIn, numberingOf } from "./numbering";
import type { CommentedFile } from "./numbering";
import type { Side } from "./side-by-side";

type Diff = RpcOutput<typeof diffRpc>;

const path = "a.txt";

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

type Diffs = Record<CommentedFile["diff"], Pick<Diff, "hunks">>;

// The file's diff, with how the review numbers its lines, by the file's other diff.
function numberedIn(diffs: Diffs, diff: CommentedFile["diff"]) {
  return {
    path,
    numbering: numberingOf(diff, diff === "unstaged" ? diffs.staged : diffs.unstaged),
  };
}

// What a comment on the line of the diff with the number on the side is on, inline, or on the side
// side by side.
function madeOn(
  diffs: Diffs,
  diff: CommentedFile["diff"],
  [side, number]: [Side, number],
  way?: Side,
): CommentTarget | undefined {
  const line = diffs[diff].hunks
    .flatMap(numberLines)
    .find((each) => numberIn(each, side) === number);

  return line === undefined ? undefined : targetOf(numberedIn(diffs, diff), line, way);
}

// The context a comment on the target is sent with, by the file's diffs.
function sentWithin(diffs: Diffs, target: CommentTarget | undefined) {
  const review = reviewOf(
    "/repository",
    target === undefined ? [] : [{ ...target, id: 1, body: "" }],
    ({ diff }) => diffs[diff],
  );

  const sent = review.attachment?.comments[0];

  return sent === undefined
    ? review.unsent
    : { side: sent.side, lineNumber: sent.lineNumber, context: sent.context };
}

test("a comment on a partly staged file is on its line as HEAD and the worktree number it, and is sent with the lines around it numbered so", () => {
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

  const nine = madeOn(diffs, "unstaged", ["old", 10]);
  const zero = madeOn(diffs, "staged", ["new", 1]);

  expect([nine, zero]).toStrictEqual([
    { path, side: "old", line: 9 },
    { path, side: "new", line: 2 },
  ]);
  expect(sentWithin(diffs, nine)).toStrictEqual({
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
  expect(sentWithin(diffs, zero)).toStrictEqual({
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

test("a line only the index has, staged and then changed in the worktree, can't be commented on, and its other versions can", () => {
  // HEAD has two, the index TWO, and the worktree Two.
  const diffs = {
    staged: { hunks: [hunk(1, 1, [" one", "-two", "+TWO", " three"])] },
    unstaged: { hunks: [hunk(1, 1, [" one", "-TWO", "+Two", " three"])] },
  };

  expect([
    madeOn(diffs, "staged", ["new", 2]),
    madeOn(diffs, "unstaged", ["old", 2]),
    madeOn(diffs, "staged", ["old", 2]),
    madeOn(diffs, "unstaged", ["new", 2]),
  ]).toStrictEqual([
    undefined,
    undefined,
    { path, side: "old", line: 2 },
    { path, side: "new", line: 2 },
  ]);
});

test("inline, a comment on an unchanged line the worktree hasn't is on its line in HEAD, and side by side, a side whose version the review hasn't can't be commented on", () => {
  // HEAD has a, b and c, the index a, b and C, and the worktree a and C.
  const removed = {
    staged: { hunks: [hunk(1, 1, [" a", " b", "-c", "+C"])] },
    unstaged: { hunks: [hunk(1, 1, [" a", "-b", " C"])] },
  };

  expect(madeOn(removed, "staged", ["new", 2])).toStrictEqual({ path, side: "old", line: 2 });
  expect(madeOn(removed, "staged", ["new", 2], "new")).toBeUndefined();

  // HEAD has a and b, the index X between them, and the worktree Y after b.
  const added = {
    staged: { hunks: [hunk(1, 1, [" a", "+X", " b"])] },
    unstaged: { hunks: [hunk(1, 1, [" a", " X", " b", "+Y"])] },
  };

  expect(madeOn(added, "unstaged", ["old", 2], "old")).toBeUndefined();
  expect(madeOn(added, "unstaged", ["old", 2])).toStrictEqual({ path, side: "new", line: 2 });
  expect(madeOn(added, "unstaged", ["old", 1], "old")).toStrictEqual({
    path,
    side: "old",
    line: 1,
  });
});

test("a comment is sent with its line where its file's diffs change it, rather than where one has it unchanged", () => {
  // HEAD has a and b, the index X between them, and the worktree X and then Y.
  const diffs = {
    staged: { hunks: [hunk(1, 1, [" a", "+X", " b"])] },
    unstaged: { hunks: [hunk(1, 1, [" a", " X", " b", "+Y"])] },
  };

  expect(sentWithin(diffs, { path, side: "new", line: 2 })).toMatchObject({
    context: { targetLine: { type: "add", content: "X" }, hunkHeader: "@@ -1,2 +1,3 @@" },
  });
  expect(sentWithin(diffs, { path, side: "old", line: 1 })).toMatchObject({
    context: { targetLine: { type: "context", content: "a" }, hunkHeader: "@@ -1,2 +1,4 @@" },
  });
});

test("a hunk with lines only on one side starts after the line before it, as the review numbers that line", () => {
  // HEAD has a, b and c, the index X before them, and the worktree Y after them.
  const diffs = {
    staged: { hunks: [hunk(0, 1, ["+X"])] },
    unstaged: { hunks: [hunk(4, 5, ["+Y"])] },
  };

  expect(sentWithin(diffs, { path, side: "new", line: 5 })).toMatchObject({
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

  expect(sentWithin(diffs, { path, side: "new", line: 7 })).toMatchObject({
    context: { hunkHeader: "@@ -1,0 +4,5 @@" },
  });

  // HEAD hasn't the file, the index has X and Z, and the worktree Y between them.
  const added = {
    staged: { hunks: [hunk(0, 1, ["+X", "+Z"])] },
    unstaged: { hunks: [hunk(1, 1, [" X", "+Y", " Z"])] },
  };

  expect(sentWithin(added, { path, side: "new", line: 2 })).toMatchObject({
    context: { hunkHeader: "@@ -0,0 +1,3 @@" },
  });
});

const ways = [undefined, "old", "new"] as const;

// Each line each diff shows, the diff it's in, and each way it's commented on: inline, and on each
// side side by side.
function linesOf(diffs: Diffs) {
  return (["unstaged", "staged"] as const).flatMap((diff) =>
    diffs[diff].hunks
      .flatMap(numberLines)
      .flatMap((line) => ways.map((way) => ({ diff, line, way }))),
  );
}

interface Versions {
  head: readonly string[];
  worktree: readonly string[];
}

const opposite = { old: "new", new: "old" } as const;

// What a comment on the line, made the way, is on, by the versions: the line of HEAD, for the old
// side, or of the worktree, for the new one, that's the same line, on the side made on, or inline,
// on a removed line's old side, or any other's new one, or else its other side. Undefined where
// neither of those versions has it.
function expectedOn(line: NumberedLine, way: Side | undefined, { head, worktree }: Versions) {
  const first = way ?? (line.kind === "removed" ? "old" : "new");
  const kept = { old: line.kind !== "added", new: line.kind !== "removed" };
  const sides = way === undefined ? [first, opposite[first]] : [first];

  return sides.flatMap((side) => {
    const at = (side === "old" ? head : worktree).indexOf(line.text);

    return kept[side] && at !== -1 ? [{ path, side, line: at + 1 }] : [];
  })[0];
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

// Each line the diffs show that can be commented on, each way it can be, and what that's on.
function commentedLines(diffs: Diffs): { line: NumberedLine; target: CommentTarget }[] {
  return linesOf(diffs).flatMap(({ diff, line, way }) => {
    const target = targetOf(numberedIn(diffs, diff), line, way);

    return target === undefined ? [] : [{ line, target }];
  });
}

function comment(target: CommentTarget): ReviewComment {
  return { ...target, id: 1, body: "" };
}

test("a comment on a partly staged file is on the line of HEAD or the worktree that its line is, unless neither has it, and is sent there, with the lines around it numbered so", () => {
  fc.assert(
    fc.property(partlyStaged, ({ versions, diffs }) => {
      const made = linesOf(diffs).map(({ diff, line, way }) => ({
        line,
        target: targetOf(numberedIn(diffs, diff), line, way),
        expected: expectedOn(line, way, versions),
      }));

      expect(made.map(({ target }) => target)).toStrictEqual(made.map(({ expected }) => expected));

      for (const { line, target } of commentedLines(diffs)) {
        const placement = placementOf(comment(target), ({ diff }) => diffs[diff]);

        expect(placement).toMatchObject({
          located: { line: { text: line.text } },
          sent: { side: target.side, lineNumber: target.line },
        });
        expect(misnumbered(placement, versions)).toStrictEqual([]);
      }
    }),
  );
});

// Whether the line, which says what the comment's line does, is on the side the comment is on.
function onSide(line: NumberedLine, { side }: CommentTarget): boolean {
  return numberIn(line, side) !== undefined;
}

// The lines of the diffs, inline, that are the comment's line, which says what the line does, on the
// side it's on.
function sameLines(diffs: Diffs, line: NumberedLine, target: CommentTarget) {
  return linesOf(diffs).filter(
    ({ line: each, way }) => way === undefined && each.text === line.text && onSide(each, target),
  );
}

// Where a comment on the target, which says what the line does, is placed, by the lines of the
// diffs that are its line: on one of them, or else nowhere.
function placedAmong(same: readonly unknown[], line: NumberedLine, target: CommentTarget) {
  return same.length === 0
    ? { unsent: "gone" }
    : { located: { line: { text: line.text } }, sent: { lineNumber: target.line } };
}

test("a comment stays on its line as the file's index changes, as its hunks are staged and unstaged, and shows under it, and is sent on it, in whichever of the file's diffs has it", () => {
  fc.assert(
    fc.property(restaged, ({ before, after }) => {
      for (const { line, target } of commentedLines(before.diffs)) {
        const shown = linesOf(after.diffs).filter(({ diff, line: each, way }) =>
          shownOn(numberedIn(after.diffs, diff), each, way).some(
            (on) => JSON.stringify(on) === JSON.stringify(target),
          ),
        );

        const same = sameLines(after.diffs, line, target);

        expect(shown.map(({ line: each }) => each.text)).toStrictEqual(shown.map(() => line.text));
        expect(shown.filter(({ way }) => way === undefined)).toStrictEqual(same);
        expect(placementOf(comment(target), ({ diff }) => after.diffs[diff])).toMatchObject(
          placedAmong(same, line, target),
        );
      }
    }),
  );
});
