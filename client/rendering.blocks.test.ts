import * as fc from "fast-check";
import { expect, test } from "vitest";

import { hunkLines } from "../test/hunk-lines";
import { blocksOf, numberLines } from "./lines";
import type { NumberedLine } from "./lines";
import { blockTall, blocksOfRows, covers, rendersBlock, widened, windowAround } from "./rendering";
import type { LineWindow } from "./rendering";
import { rowsOf } from "./side-by-side";
import type { Row } from "./side-by-side";

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

// Each of the blocks' sizes, and where each starts and the one before ends, from 0.
function blockParts(blocks: readonly { start: number; end: number }[]) {
  return {
    sizes: blocks.map(({ start, end }) => end - start),
    starts: blocks.map(({ start }) => start),
    joins: [0, ...blocks.map(({ end }) => end)].slice(0, blocks.length),
  };
}

// How many rows each block has in the tests.
const rowsPerBlock = 7;

// Whether the window has the line.
function holds(window: LineWindow, at: number): boolean {
  return at >= window.first && at <= window.last;
}

test("rows are in blocks of rowsPerBlock, one after another from the first, the last with those left", () => {
  fc.assert(
    fc.property(fc.nat(5 * rowsPerBlock), (rows) => {
      const { sizes, starts, joins } = blockParts(blocksOfRows(rows, rowsPerBlock));

      expect(starts).toStrictEqual(joins);
      expect(sum(sizes)).toBe(rows);
      expect(sizes.slice(0, -1).filter((size) => size !== rowsPerBlock)).toStrictEqual([]);
      expect(sizes.filter((size) => size > rowsPerBlock)).toStrictEqual([]);
      expect(sizes.filter((size) => size < 1)).toStrictEqual([]);
    }),
    { examples: [[0], [1], [rowsPerBlock], [rowsPerBlock + 1]] },
  );
});

// A window of a file's new version: `total` lines, a line around which the window is, and how many
// lines it has, and how many more to widen it by.
const windows = fc.record({
  total: fc.nat(300),
  anchor: fc.integer({ min: -50, max: 350 }),
  lines: fc.nat(100),
  more: fc.integer({ min: 1, max: 100 }),
});

test("a window around a line has as many lines as asked, from half of them before it", () => {
  fc.assert(
    fc.property(windows, ({ anchor, lines }) => {
      const { first, last } = windowAround(anchor, lines);

      expect(last - first + 1).toBe(lines);
      expect(anchor - first).toBe(Math.floor(lines / 2));
    }),
  );
});

// The numbers of the version's lines the test finds, of `total` of them.
function versionLines(total: number, found: (line: number) => boolean): number[] {
  return Array.from({ length: total }, (_, index) => index + 1).filter(found);
}

// How many of the version's lines are before the window, in it and after it.
function counted(window: LineWindow, total: number) {
  return {
    before: versionLines(total, (at) => at < window.first).length,
    inside: versionLines(total, (at) => holds(window, at)).length,
    after: versionLines(total, (at) => at > window.last).length,
  };
}

test("a window widened keeps the version's lines it has, and gains as many more as asked, or all the version has left", () => {
  fc.assert(
    fc.property(windows, ({ total, anchor, lines, more }) => {
      const window = windowAround(anchor, lines);
      const wider = widened(window, total, more);
      const was = counted(window, total);

      expect(counted(wider, total).inside - was.inside).toBe(
        Math.min(more, was.before + was.after),
      );
      expect(
        versionLines(total, (at) => holds(window, at)).filter((at) => !holds(wider, at)),
      ).toStrictEqual([]);
    }),
    { examples: [[{ total: 5, anchor: 300, lines: 0, more: 3 }]] },
  );
});

test("a window widens by half on each side, or as far as the version goes on one and the rest on the other", () => {
  fc.assert(
    fc.property(windows, ({ total, anchor, lines, more }) => {
      const window = windowAround(anchor, lines);
      const was = counted(window, total);
      const now = counted(widened(window, total, more), total);
      const half = Math.floor(more / 2);

      expect(was.before - now.before).toBeGreaterThanOrEqual(Math.min(was.before, half));
      expect(was.after - now.after).toBeGreaterThanOrEqual(Math.min(was.after, more - half));
    }),
    { examples: [[{ total: 100, anchor: 50, lines: 0, more: 7 }]] },
  );
});

test("a window widened again and again comes to cover the version, and covers it only once it has all its lines", () => {
  fc.assert(
    fc.property(windows, ({ total, anchor, lines, more }) => {
      let window = windowAround(anchor, lines);

      for (let step = 0; step <= Math.ceil(total / more); step += 1) {
        expect(covers(window, total)).toBe(counted(window, total).inside === total);
        window = widened(window, total, more);
      }

      expect(covers(window, total)).toBe(true);
    }),
    {
      examples: [
        [{ total: 10, anchor: 1, lines: 1, more: 1 }],
        [{ total: 0, anchor: 300, lines: 0, more: 1 }],
      ],
    },
  );
});

// Unchanged lines, numbered from the line in the new version.
function unchangedFrom(newStart: number, count: number): NumberedLine[] {
  return numberLines({
    oldStart: 1,
    newStart,
    lines: Array.from({ length: count }, () => ({
      kind: "context",
      text: "a",
      newline: true,
      runs: [],
    })),
  });
}

// The lines' numbers in the new version.
function newNumbers(lines: readonly NumberedLine[]): number[] {
  return lines.flatMap(({ newNumber }) => (newNumber === undefined ? [] : [newNumber]));
}

test("a block of lines renders while there's no window, or some of its lines are in it", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 20 }),
      fc.integer({ min: 1, max: 3 * rowsPerBlock }),
      fc.integer({ min: -20, max: 3 * rowsPerBlock }),
      fc.nat(2 * rowsPerBlock),
      (newStart, count, first, size) => {
        const lines = unchangedFrom(newStart, count);
        const window = { first, last: first + size };

        for (const block of blocksOfRows(count, rowsPerBlock)) {
          const numbers = newNumbers(lines.slice(block.start, block.end));

          expect(rendersBlock(undefined, lines, block)).toBe(true);
          expect(rendersBlock(window, lines, block)).toBe(numbers.some((at) => holds(window, at)));
        }
      },
    ),
  );
});

// How many lines tall the rows of the lines show, counted row by row: a line each, and one more for
// a missing newline's note on either side.
function linesTallTogether(rows: readonly Row[]): number {
  const notes = rows.filter(
    (row) => row.old?.line.newline === false || row.new?.line.newline === false,
  );

  return rows.length + notes.length;
}

// The lines as rows of their own, as inline.
function inlineRows(lines: readonly NumberedLine[]): Row[] {
  return lines.map((shown, index) => ({ old: { index, line: shown }, new: undefined }));
}

// How tall the blocks of the lines, or of their rows side by side, are together.
function blocksTall(
  lines: readonly NumberedLine[],
  rows: readonly Row[] | undefined,
  count: number,
): number {
  return sum(blocksOfRows(count, rowsPerBlock).map((block) => blockTall(lines, rows, block)));
}

test("a hunk's blocks are together as tall as its lines inline", () => {
  fc.assert(
    fc.property(hunkLines, (lines) => {
      expect(blocksTall(lines, undefined, lines.length)).toBe(linesTallTogether(inlineRows(lines)));
    }),
  );
});

// Each run's removed lines paired in turn with its added lines, by their indices, so that a pair is
// on one row side by side.
function pairedInOrder(lines: readonly NumberedLine[]): Map<number, number> {
  return new Map(
    blocksOf(lines).flatMap((block) =>
      "removed" in block
        ? block.removed.flatMap(({ index }, at) => {
            const partner = block.added[at];

            return partner === undefined ? [] : [[index, partner.index] as const];
          })
        : [],
    ),
  );
}

test("a hunk's blocks are together as tall as its rows side by side, with its runs' lines paired", () => {
  fc.assert(
    fc.property(hunkLines, (lines) => {
      const rows = rowsOf(lines, pairedInOrder(lines));

      expect(blocksTall(lines, rows, rows.length)).toBe(linesTallTogether(rows));
    }),
  );
});
