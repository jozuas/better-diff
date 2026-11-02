import * as fc from "fast-check";
import { expect, test } from "vitest";

import { numberLines } from "./lines";
import type { NumberedLine } from "./lines";
import { numbersOf, rowsOf, shows } from "./side-by-side";
import type { Row, Side } from "./side-by-side";

type Kind = NumberedLine["kind"];

// A hunk's lines, numbered. Each has text no other line has.
const hunkLines = fc
  .array(
    fc.record({
      kind: fc.constantFrom<Kind>("context", "removed", "added"),
      text: fc.string({ unit: "binary" }),
      newline: fc.boolean(),
    }),
    { maxLength: 20 },
  )
  .map((lines) =>
    numberLines({
      oldStart: 1,
      newStart: 1,
      lines: lines.map((line, index) => ({ ...line, text: `${index} ${line.text}` })),
    }),
  );

// The kind of line each side doesn't show.
const without: Record<Side, Kind> = { old: "added", new: "removed" };

// The lines the side shows, row by row.
function shownOn(rows: readonly Row[], side: Side): Row[Side][] {
  return rows.flatMap((row) => row[side] ?? []);
}

// The lines of the side's version, each with its index in the hunk.
function linesOf(lines: readonly NumberedLine[], side: Side): Row[Side][] {
  return lines.flatMap((line, index) => (line.kind === without[side] ? [] : [{ index, line }]));
}

test("each side shows the lines of its version, in order, each with its index in the hunk", () => {
  fc.assert(
    fc.property(hunkLines, (lines) => {
      const rows = rowsOf(lines);

      expect(shownOn(rows, "old")).toStrictEqual(linesOf(lines, "old"));
      expect(shownOn(rows, "new")).toStrictEqual(linesOf(lines, "new"));
    }),
  );
});

function isUnchanged(row: Row): boolean {
  return row.old?.line.kind === "context" || row.new?.line.kind === "context";
}

test("an unchanged line is level with itself", () => {
  fc.assert(
    fc.property(hunkLines, (lines) => {
      for (const row of rowsOf(lines).filter(isUnchanged)) {
        expect(row.old).toBeDefined();
        expect(row.old).toStrictEqual(row.new);
      }
    }),
  );
});

// The rows between unchanged lines.
function runsOf(rows: readonly Row[]): Row[][] {
  const runs: Row[][] = [[]];

  for (const row of rows) {
    if (isUnchanged(row)) {
      runs.push([]);
    } else {
      runs.at(-1)?.push(row);
    }
  }

  return runs;
}

function isEmpty(row: Row): boolean {
  return row.old === undefined && row.new === undefined;
}

// Whether each of the rows has a line on the side.
function linesIn(rows: readonly Row[], side: Side): boolean[] {
  return rows.map((row) => row[side] !== undefined);
}

test("between unchanged lines, each side's lines are level with the other's from the top, and no row is empty", () => {
  fc.assert(
    fc.property(hunkLines, (lines) => {
      for (const run of runsOf(rowsOf(lines))) {
        expect(run.filter(isEmpty)).toStrictEqual([]);

        for (const side of ["old", "new"] as const) {
          expect(linesIn(run, side)).toStrictEqual(
            linesIn(run, side).toSorted((one, other) => Number(other) - Number(one)),
          );
        }
      }
    }),
  );
});

test("lines of each run of changes are level from the top, in the order git gives them", () => {
  const lines = numberLines({
    oldStart: 4,
    newStart: 4,
    lines: [
      { kind: "removed", text: "a", newline: true },
      { kind: "removed", text: "b", newline: true },
      { kind: "added", text: "c", newline: true },
      { kind: "context", text: "d", newline: true },
      { kind: "added", text: "e", newline: true },
    ],
  });

  expect(rowsOf(lines).map((row) => [row.old?.line.text, row.new?.line.text])).toStrictEqual([
    ["a", "c"],
    ["b", undefined],
    ["d", "d"],
    [undefined, "e"],
  ]);
});

test.each<[Side | undefined, Kind, boolean]>([
  [undefined, "removed", true],
  [undefined, "added", true],
  ["old", "context", true],
  ["old", "removed", true],
  ["old", "added", false],
  ["new", "context", true],
  ["new", "removed", false],
  ["new", "added", true],
])("the %s side shows a line %s: %s", (side, kind, shown) => {
  expect(shows(side, kind)).toBe(shown);
});

const line: NumberedLine = {
  kind: "context",
  text: "a",
  newline: true,
  oldNumber: 3,
  newNumber: 5,
};

test("an inline line shows its old number, then its new one", () => {
  expect(numbersOf(line)).toStrictEqual([
    { side: "old", number: 3 },
    { side: "new", number: 5 },
  ]);
});

test("a side's line shows only its number in that side's version", () => {
  expect(numbersOf(line, "old")).toStrictEqual([{ side: "old", number: 3 }]);
  expect(numbersOf(line, "new")).toStrictEqual([{ side: "new", number: 5 }]);
});
