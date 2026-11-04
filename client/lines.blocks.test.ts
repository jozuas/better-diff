import * as fc from "fast-check";
import { expect, test } from "vitest";

import { hunkLines } from "../test/hunk-lines";
import { blocksOf } from "./lines";
import type { Run, IndexedLine } from "./lines";

type Block = ReturnType<typeof blocksOf>[number];

function isRun(block: Block | undefined): block is Run {
  return block !== undefined && "removed" in block;
}

// The lines of the block: an unchanged line, or a run's removed lines and its added ones.
function linesIn(block: Block): IndexedLine[] {
  return isRun(block) ? [...block.removed, ...block.added] : [block];
}

function indicesOf(lines: readonly IndexedLine[]): number[] {
  return lines.map(({ index }) => index);
}

function ascending(numbers: readonly number[]): number[] {
  return numbers.toSorted((one, other) => one - other);
}

// Whether each number is one more than the one before it.
function isConsecutive(numbers: readonly number[]): boolean {
  return numbers.every((number, index) => number === (numbers[0] ?? 0) + index);
}

// The runs that come right after another run.
function runsAfterRuns(blocks: readonly Block[]): Block[] {
  return blocks.filter((block, index) => isRun(block) && isRun(blocks[index - 1]));
}

test("the blocks have each of the lines once, with its index", () => {
  fc.assert(
    fc.property(hunkLines, (lines) => {
      expect(
        blocksOf(lines)
          .flatMap(linesIn)
          .toSorted((one, other) => one.index - other.index),
      ).toStrictEqual(lines.map((line, index) => ({ index, line })));
    }),
  );
});

test("a run has its removed lines and its added ones apart, each in order", () => {
  fc.assert(
    fc.property(hunkLines, (lines) => {
      for (const run of blocksOf(lines).filter(isRun)) {
        expect(run.removed.map(({ line }) => line.kind)).toStrictEqual(
          run.removed.map(() => "removed"),
        );
        expect(run.added.map(({ line }) => line.kind)).toStrictEqual(run.added.map(() => "added"));
        expect(indicesOf(run.removed)).toStrictEqual(ascending(indicesOf(run.removed)));
        expect(indicesOf(run.added)).toStrictEqual(ascending(indicesOf(run.added)));
      }
    }),
  );
});

test("a run has all the changes between two unchanged lines, so none is empty or next to another", () => {
  fc.assert(
    fc.property(hunkLines, (lines) => {
      const blocks = blocksOf(lines);

      for (const run of blocks.filter(isRun)) {
        const indices = ascending(indicesOf(linesIn(run)));

        expect(indices).not.toHaveLength(0);
        expect(isConsecutive(indices)).toBe(true);
      }

      expect(runsAfterRuns(blocks)).toStrictEqual([]);
    }),
  );
});
