import * as fc from "fast-check";
import { expect, test } from "vitest";

import { lineAsBefore, textAsBefore } from "./line-content";
import type { LineContent } from "./line-content";
import type { NumberedLine } from "./lines";

type Runs = NumberedLine["runs"];

// Few values of each part, so that two lines are often alike in some parts or all.
const ids = fc.constantFrom("a:0:1", "a:0:2", "a:new 3");
const kinds = fc.constantFrom("context", "removed", "added");
const texts = fc.constantFrom("", "x", "x\ty ", "é 😀\r");
const numbers = fc.constantFrom(undefined, 1, 2);
const sides = fc.constantFrom(undefined, "old", "new");

const runLists: fc.Arbitrary<Runs> = fc.array(
  fc.tuple(fc.integer({ min: 1, max: 2 }), fc.constantFrom(null, "keyword")),
  { maxLength: 2 },
);

const changeLists = fc.array(
  fc.record({ start: fc.integer({ min: 0, max: 1 }), end: fc.integer({ min: 1, max: 2 }) }),
  { maxLength: 2 },
);

const content: fc.Arbitrary<LineContent> = fc.record({
  id: ids,
  line: fc.record({
    kind: kinds,
    text: texts,
    newline: fc.boolean(),
    runs: runLists,
    oldNumber: numbers,
    newNumber: numbers,
  }),
  selected: fc.boolean(),
  side: sides,
  selectable: fc.boolean(),
  changes: changeLists,
});

// Either the value, or another of the arbitrary's.
function sameOr<Value>(value: Value, other: fc.Arbitrary<Value>): fc.Arbitrary<Value> {
  return fc.oneof(fc.constant(value), other);
}

// A line, and another with some of its parts and others of its own, all made anew, as reading a diff
// again makes them.
const contents = content.chain((first) =>
  fc.tuple(
    fc.constant(first),
    fc.record({
      id: sameOr(first.id, ids),
      line: fc.record({
        kind: sameOr(first.line.kind, kinds),
        text: sameOr(first.line.text, texts),
        newline: sameOr(first.line.newline, fc.boolean()),
        runs: sameOr(first.line.runs, runLists).map((made) =>
          made.map(([length, style]): Runs[number] => [length, style]),
        ),
        oldNumber: sameOr(first.line.oldNumber, numbers),
        newNumber: sameOr(first.line.newNumber, numbers),
      }),
      selected: sameOr(first.selected, fc.boolean()),
      side: sameOr(first.side, sides),
      selectable: sameOr(first.selectable, fc.boolean()),
      changes: sameOr(first.changes, changeLists).map((made) =>
        made.map(({ start, end }) => ({ start, end })),
      ),
    }),
  ),
);

// The parts of a line its text's pieces render from, in a form that's equal for lines whose pieces
// render the same.
function textOf({ line, changes }: LineContent): string {
  return JSON.stringify({ kind: line.kind, text: line.text, runs: line.runs, changes });
}

function restOf({ id, selectable, line, selected, side }: LineContent): string {
  return JSON.stringify({
    id,
    selectable,
    oldNumber: line.oldNumber ?? null,
    newNumber: line.newNumber ?? null,
    newline: line.newline,
    selected,
    side: side ?? null,
  });
}

// All of a line's parts it renders from.
function renderedOf(line: LineContent): string {
  return `${textOf(line)} ${restOf(line)}`;
}

test("a line's text renders its pieces as before while its kind, text, highlights and changed text are equal, whatever else", () => {
  fc.assert(
    fc.property(contents, ([before, after]) => {
      expect(textAsBefore(before, after)).toBe(textOf(before) === textOf(after));
    }),
  );
});

test("a line renders as before while its text's pieces do and its id, numbers, newline, selection and side are equal", () => {
  fc.assert(
    fc.property(contents, ([before, after]) => {
      expect(lineAsBefore(before, after)).toBe(renderedOf(before) === renderedOf(after));
    }),
  );
});
