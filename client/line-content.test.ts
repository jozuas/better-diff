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

// What lines hear the pointer with, and start a comment with, each the same each time.
const handlers = [
  undefined,
  ...["a", "b"].map(() => ({ onPointerEnter() {}, onPointerLeave() {} })),
];

const starts = [undefined, ...["a", "b"].map(() => () => {})];
const pointers = fc.constantFrom(...handlers);
const onComments = fc.constantFrom(...starts);

const runLists: fc.Arbitrary<Runs> = fc.array(
  fc.tuple(fc.integer({ min: 1, max: 2 }), fc.constantFrom(null, "keyword")),
  { maxLength: 2 },
);

const changeLists = fc.array(
  fc.record({ start: fc.integer({ min: 0, max: 1 }), end: fc.integer({ min: 1, max: 2 }) }),
  { maxLength: 2 },
);

const foundLists = fc.array(
  fc.record({
    start: fc.integer({ min: 0, max: 1 }),
    end: fc.integer({ min: 1, max: 2 }),
    current: fc.boolean(),
  }),
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
  found: foundLists,
  pointer: pointers,
  onComment: onComments,
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
      found: sameOr(first.found, foundLists).map((made) =>
        made.map(({ start, end, current }) => ({ start, end, current })),
      ),
      pointer: sameOr(first.pointer, pointers),
      onComment: sameOr(first.onComment, onComments),
    }),
  ),
);

const aLine: LineContent = {
  id: "a:0:1",
  line: {
    kind: "added",
    text: "x\ty ",
    newline: true,
    runs: [
      [1, "keyword"],
      [3, null],
    ],
    oldNumber: undefined,
    newNumber: 1,
  },
  selected: false,
  side: "new",
  selectable: true,
  changes: [{ start: 0, end: 2 }],
  found: [{ start: 2, end: 3, current: false }],
  pointer: handlers[1],
  onComment: undefined,
};

// Lines like aLine but for one part each, a run's or a range of changed text's included, which
// `contents` seldom makes.
const othersButForOnePart: LineContent[] = [
  { ...aLine, id: "a:0:2" },
  { ...aLine, selectable: false },
  { ...aLine, selected: true },
  { ...aLine, side: "old" },
  { ...aLine, line: { ...aLine.line, kind: "removed" } },
  { ...aLine, line: { ...aLine.line, text: "x\tz " } },
  { ...aLine, line: { ...aLine.line, newline: false } },
  { ...aLine, line: { ...aLine.line, oldNumber: 1 } },
  { ...aLine, line: { ...aLine.line, newNumber: 2 } },
  {
    ...aLine,
    line: {
      ...aLine.line,
      runs: [
        [2, "keyword"],
        [2, null],
      ],
    },
  },
  {
    ...aLine,
    line: {
      ...aLine.line,
      runs: [
        [1, null],
        [3, null],
      ],
    },
  },
  { ...aLine, changes: [{ start: 1, end: 2 }] },
  { ...aLine, changes: [{ start: 0, end: 1 }] },
  { ...aLine, found: [{ start: 1, end: 3, current: false }] },
  { ...aLine, found: [{ start: 2, end: 4, current: false }] },
  { ...aLine, found: [{ start: 2, end: 3, current: true }] },
  { ...aLine, found: [] },
  { ...aLine, pointer: handlers[2] },
  { ...aLine, onComment: starts[1] },
];

// Lines like aLine but for one part each, and aLine with every part of it made anew, which renders
// as before: with as many parts as a line has, one made anew without any of them changing is rarely
// generated.
const butForOnePart = [
  ...othersButForOnePart,
  {
    ...aLine,
    line: structuredClone(aLine.line),
    changes: structuredClone(aLine.changes),
    found: structuredClone(aLine.found),
  },
].map((other): [[LineContent, LineContent]] => [[aLine, other]]);

// The parts of a line its text's pieces render from, in a form that's equal for lines whose pieces
// render the same.
function textOf({ line, changes, found }: LineContent): string {
  return JSON.stringify({ kind: line.kind, text: line.text, runs: line.runs, changes, found });
}

function restOf({ id, selectable, line, selected, side, pointer, onComment }: LineContent): string {
  return JSON.stringify({
    id,
    selectable,
    oldNumber: line.oldNumber ?? null,
    newNumber: line.newNumber ?? null,
    newline: line.newline,
    selected,
    side: side ?? null,
    pointer: handlers.indexOf(pointer),
    onComment: starts.indexOf(onComment),
  });
}

// All of a line's parts it renders from.
function renderedOf(line: LineContent): string {
  return `${textOf(line)} ${restOf(line)}`;
}

test("a line's text renders its pieces as before while its kind, text, highlights, changed text and what the find bar found are equal, whatever else", () => {
  fc.assert(
    fc.property(contents, ([before, after]) => {
      expect(textAsBefore(before, after)).toBe(textOf(before) === textOf(after));
    }),
    { examples: butForOnePart },
  );
});

test("a line renders as before while its text's pieces do and its id, numbers, newline, selection, side, and what it hears the pointer and starts a comment with are equal", () => {
  fc.assert(
    fc.property(contents, ([before, after]) => {
      expect(lineAsBefore(before, after)).toBe(renderedOf(before) === renderedOf(after));
    }),
    { examples: butForOnePart },
  );
});
