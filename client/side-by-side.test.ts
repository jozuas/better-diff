import * as fc from "fast-check";
import { expect, test } from "vitest";

import { hunkLines } from "../test/hunk-lines";
import { blocksOf, numberLines } from "./lines";
import type { NumberedLine } from "./lines";
import { linesTall, numbersOf, rowKey, rowsOf, rowTall, shows, sides } from "./side-by-side";
import type { Row, Side } from "./side-by-side";

type Kind = NumberedLine["kind"];

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

// The index of the added line each removed line is paired with, by the removed line's: the line
// `skip` after the last one paired, by the removed line's skip, or none where its skip is 0 or the
// run has no such line.
function partnersOf(lines: readonly NumberedLine[], skips: readonly number[]): Map<number, number> {
  const partners = new Map<number, number>();

  for (const block of blocksOf(lines)) {
    if ("removed" in block) {
      let next = 0;

      for (const { index } of block.removed) {
        const skip = skips[index] ?? 0;
        const partner = block.added[next + skip - 1];

        if (skip > 0 && partner !== undefined) {
          partners.set(index, partner.index);
          next += skip;
        }
      }
    }
  }

  return partners;
}

// A hunk's lines, and a pairing of each of its runs of changes: each removed line in turn paired
// with an added line after the last one paired, or with none.
const pairedHunkLines = hunkLines.chain((lines) =>
  fc
    .array(fc.nat({ max: 3 }), { minLength: lines.length, maxLength: lines.length })
    .map((skips) => ({ lines, partners: partnersOf(lines, skips) })),
);

test("each side shows the lines of its version, in order, each with its index in the hunk", () => {
  fc.assert(
    fc.property(pairedHunkLines, ({ lines, partners }) => {
      const rows = rowsOf(lines, partners);

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
    fc.property(pairedHunkLines, ({ lines, partners }) => {
      for (const row of rowsOf(lines, partners).filter(isUnchanged)) {
        expect(row.old).toBeDefined();
        expect(row.old).toStrictEqual(row.new);
      }
    }),
  );
});

function isLevel(row: Row): boolean {
  return row.old !== undefined && row.new !== undefined;
}

// The indices of the lines level with each other on a row of changed lines.
function changedLevel(rows: readonly Row[]): [number | undefined, number | undefined][] {
  return rows.flatMap((row) =>
    isLevel(row) && !isUnchanged(row) ? [[row.old?.index, row.new?.index]] : [],
  );
}

test("a removed line is level with the added line it's paired with, and a changed line that isn't paired is level with nothing", () => {
  fc.assert(
    fc.property(pairedHunkLines, ({ lines, partners }) => {
      expect(changedLevel(rowsOf(lines, partners))).toStrictEqual([...partners]);
    }),
  );
});

// The rows between lines level with each other.
function stretchesOf(rows: readonly Row[]): Row[][] {
  const stretches: Row[][] = [[]];

  for (const row of rows) {
    if (isLevel(row)) {
      stretches.push([]);
    } else {
      stretches.at(-1)?.push(row);
    }
  }

  return stretches;
}

function isEmpty(row: Row): boolean {
  return row.old === undefined && row.new === undefined;
}

// Whether each of the rows has a removed line, rather than an added one.
function removedIn(rows: readonly Row[]): boolean[] {
  return rows.map((row) => row.old !== undefined);
}

test("between lines level with each other, removed lines come before added ones, and no row is empty", () => {
  fc.assert(
    fc.property(pairedHunkLines, ({ lines, partners }) => {
      for (const stretch of stretchesOf(rowsOf(lines, partners))) {
        const removed = removedIn(stretch);

        expect(stretch.filter(isEmpty)).toStrictEqual([]);
        expect(removed).toStrictEqual(
          removed.toSorted((one, other) => Number(other) - Number(one)),
        );
      }
    }),
  );
});

test("a run's lines are lined up as delta lines them up, in the order git gives them", () => {
  const lines = numberLines({
    oldStart: 4,
    newStart: 4,
    lines: [
      { kind: "removed", text: "a", newline: true, runs: [] },
      { kind: "removed", text: "b", newline: true, runs: [] },
      { kind: "removed", text: "c", newline: true, runs: [] },
      { kind: "added", text: "x", newline: true, runs: [] },
      { kind: "added", text: "b2", newline: true, runs: [] },
      { kind: "added", text: "y", newline: true, runs: [] },
      { kind: "context", text: "d", newline: true, runs: [] },
      { kind: "added", text: "e", newline: true, runs: [] },
    ],
  });

  expect(
    rowsOf(lines, new Map([[1, 4]])).map((row) => [row.old?.line.text, row.new?.line.text]),
  ).toStrictEqual([
    ["a", undefined],
    [undefined, "x"],
    ["b", "b2"],
    ["c", undefined],
    [undefined, "y"],
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
  runs: [],
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

test("each of a hunk's rows side by side has a key none of its other rows has", () => {
  fc.assert(
    fc.property(pairedHunkLines, ({ lines, partners }) => {
      const keys = rowsOf(lines, partners).map(rowKey);

      expect(new Set(keys).size).toBe(keys.length);
    }),
  );
});

// The keys of the rows that have an unchanged or removed line.
function oldRowKeys(
  lines: readonly NumberedLine[],
  partners: ReadonlyMap<number, number>,
): string[] {
  return rowsOf(lines, partners).flatMap((row) => (row.old === undefined ? [] : [rowKey(row)]));
}

test("the keys of a hunk's rows with unchanged and removed lines stay as lines are added or removed above it in the new version", () => {
  fc.assert(
    fc.property(
      pairedHunkLines,
      fc.integer({ min: 2, max: 20 }),
      ({ lines, partners }, newStart) => {
        const moved = numberLines({ oldStart: 1, newStart, lines });

        expect(oldRowKeys(moved, partners)).toStrictEqual(oldRowKeys(lines, partners));
      },
    ),
  );
});

test("a line is a line tall, and two with the note under a last line without a newline", () => {
  const shown: Omit<NumberedLine, "newline"> = {
    kind: "context",
    text: "a",
    runs: [],
    oldNumber: 1,
    newNumber: 1,
  };

  expect(linesTall({ ...shown, newline: true })).toBe(1);
  expect(linesTall({ ...shown, newline: false })).toBe(2);
});

// How many lines tall each side of the row with a line shows.
function sidesTall(row: Row): number[] {
  return sides.flatMap((side) => {
    const shown = row[side];

    return shown === undefined ? [] : [linesTall(shown.line)];
  });
}

test("a row side by side is as tall as its taller side", () => {
  fc.assert(
    fc.property(pairedHunkLines, ({ lines, partners }) => {
      const rows = rowsOf(lines, partners);

      expect(rows.map(rowTall)).toStrictEqual(rows.map((row) => Math.max(...sidesTall(row))));
    }),
  );
});
