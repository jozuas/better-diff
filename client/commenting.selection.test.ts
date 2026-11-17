import * as fc from "fast-check";
import { expect, test } from "vitest";

import { numberedFile } from "../test/comments";
import { hunkLines } from "../test/hunk-lines";
import { startedOn } from "./commenting";
import { targetOf } from "./comments";
import type { CommentTarget, NumberedFile } from "./comments";
import { numberLines } from "./lines";
import type { NumberedLine } from "./lines";
import { numbered as reviewNumber } from "./numbering";
import type { Numbering } from "./numbering";
import type { LineRange } from "./selection";
import type { Side } from "./side-by-side";

const file = numberedFile("a.txt");

const sides = fc.constantFrom<Side | undefined>(undefined, "old", "new");

// The line the pointer is over: any of a few, on any side, or none.
const pointedAt = fc.option(fc.record({ index: fc.nat(4), side: sides }), { nil: undefined });

// How the review numbers lines, but for those of the numbers on each side, which its version hasn't,
// as a line only the index has.
const leavingOut = fc
  .record({ old: fc.uniqueArray(fc.nat(20)), new: fc.uniqueArray(fc.nat(20)) })
  .map((missing): Numbering => ({
    old: (number) => (missing.old.includes(number) ? undefined : number),
    new: (number) => (missing.new.includes(number) ? undefined : number),
  }));

// Lines selected of a hunk's lines, inline or on either side, from a first to a last, of those it
// has.
function rangeIn(lines: readonly NumberedLine[]): fc.Arbitrary<LineRange> {
  const index = fc.nat(Math.max(0, lines.length - 1));

  return fc.tuple(index, index).chain(([one, other]) => {
    const range = { file: 0, hunk: 0, first: Math.min(one, other), last: Math.max(one, other) };

    return fc.constantFrom<LineRange>(range, { ...range, side: "old" }, { ...range, side: "new" });
  });
}

const selectedLines = hunkLines.chain((lines) =>
  fc.record({ lines: fc.constant(lines), range: rangeIn(lines) }),
);

// What a comment started on the selected lines is on, as a simpler model has it: the last of them
// that can be commented on, from the first, on the last one's side where it has that one.
function selectionModel(
  numbered: NumberedFile,
  lines: readonly NumberedLine[],
  { first, last, side }: LineRange,
): CommentTarget | undefined {
  const selected = lines.filter((_, index) => index >= first && index <= last);
  let end: CommentTarget | undefined;

  for (const line of selected) {
    end = targetOf(numbered, line, side) ?? end;
  }

  if (end === undefined) {
    return undefined;
  }

  for (const line of selected) {
    const begin = targetOf(numbered, line, end.side) ?? targetOf(numbered, line, side);

    if (begin !== undefined) {
      return begin.side === end.side && begin.line === end.line
        ? end
        : { ...end, start: { side: begin.side, line: begin.line } };
    }
  }

  return end;
}

// A line on its side, without what tells it apart from the others of its version.
function lineOnly({ side, line }: { side: Side; line: number }) {
  return { side, line };
}

// The target, without what tells its lines apart from the others of their versions.
function unanchored(target: CommentTarget | undefined): CommentTarget | undefined {
  if (target === undefined) {
    return undefined;
  }

  const { path, start } = target;

  return start === undefined
    ? { path, ...lineOnly(target) }
    : { path, ...lineOnly(target), start: lineOnly(start) };
}

// The texts of what tells the target's lines apart from the others of their versions, and of the
// lines among the lines that the review numbers as they are.
function anchorTexts(
  target: CommentTarget | undefined,
  lines: readonly NumberedLine[],
  numbering: Numbering,
): [(string | undefined)[], (string | undefined)[]] {
  const on = [target, target?.start].flatMap((each) => each ?? []);

  return [
    on.map(({ anchor }) => anchor?.text),
    on.map(
      ({ side, line }) => lines.find((each) => reviewNumber(each, side, numbering) === line)?.text,
    ),
  ];
}

test("a comment on selected lines is on those from the first that can be commented on to the last, wherever the pointer is, with what tells them apart", () => {
  fc.assert(
    fc.property(selectedLines, leavingOut, pointedAt, ({ lines, range }, numbering, pointed) => {
      const numberedIn: NumberedFile = { path: "a.txt", numbering };
      const started = startedOn(numberedIn, lines, range, pointed);
      const [texts, ofLines] = anchorTexts(started, lines, numbering);

      expect(unanchored(started)).toStrictEqual(selectionModel(numberedIn, lines, range));
      expect(texts).toStrictEqual(ofLines);
    }),
  );
});

// A hunk's lines from the old version's line 4 and the new one's line 6.
function linesFrom(kinds: readonly NumberedLine["kind"][]): NumberedLine[] {
  return numberLines({
    oldStart: 4,
    newStart: 6,
    lines: kinds.map((kind) => ({ kind, text: kind, newline: true, runs: [] })),
  });
}

test("inline, a comment on selected lines starts on the side of the line it's on where the first line has it, and else on the first line's own", () => {
  const all = { file: 0, hunk: 0, first: 0, last: 2 };

  expect(startedOn(file, linesFrom(["removed", "added", "context"]), all)).toStrictEqual({
    path: "a.txt",
    side: "new",
    line: 7,
    anchor: { text: "context", before: ["added"], after: [] },
    start: { side: "old", line: 4, anchor: { text: "removed", before: [], after: ["context"] } },
  });
  expect(startedOn(file, linesFrom(["context", "context", "removed"]), all)).toStrictEqual({
    path: "a.txt",
    side: "old",
    line: 6,
    anchor: { text: "removed", before: ["context", "context"], after: [] },
    start: {
      side: "old",
      line: 4,
      anchor: { text: "context", before: [], after: ["context", "removed"] },
    },
  });
  expect(startedOn(file, linesFrom(["added", "context"]), { ...all, last: 0 })).toStrictEqual({
    path: "a.txt",
    side: "new",
    line: 6,
    anchor: { text: "added", before: [], after: ["context"] },
  });
});

test("a comment on no lines selected is on the line the pointer is over, if it can be commented on", () => {
  const lines = numberLines({
    oldStart: 4,
    newStart: 6,
    lines: [
      { kind: "removed", text: "old", newline: true, runs: [] },
      { kind: "context", text: "kept", newline: true, runs: [] },
    ],
  });

  expect(startedOn(file, lines, undefined, { index: 1, side: undefined })).toStrictEqual({
    path: "a.txt",
    side: "new",
    line: 6,
    anchor: { text: "kept", before: [], after: [] },
  });
  expect(startedOn(file, lines, undefined, { index: 1, side: "old" })).toStrictEqual({
    path: "a.txt",
    side: "old",
    line: 5,
    anchor: { text: "kept", before: ["old"], after: [] },
  });
  expect(startedOn(file, lines, undefined, { index: 0, side: "new" })).toBeUndefined();
  expect(startedOn(file, lines, undefined, { index: 2, side: undefined })).toBeUndefined();
  expect(startedOn(file, lines)).toBeUndefined();
});

test("nothing can be commented on until it's known how the review numbers the lines", () => {
  fc.assert(
    fc.property(selectedLines, pointedAt, ({ lines, range }, pointed) => {
      expect(startedOn(undefined, lines, range, pointed)).toBeUndefined();
      expect(startedOn(undefined, lines, undefined, pointed)).toBeUndefined();
    }),
  );
});
