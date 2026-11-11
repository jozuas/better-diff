import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { NumberedLine } from "./lines";
import { carriedTo, openedAbove, showsAbove, showsAny, shownLines, toggledEntire } from "./runs";
import type { ShownRuns } from "./runs";

type Version = "oldStart" | "newStart";

interface Run {
  oldStart: number;
  newStart: number;
  open: boolean;
}

// Hunks, each starting further on than the one before in each version, each with whether the run of
// unchanged lines above it is open.
const runs = fc
  .array(
    fc.record({
      oldStep: fc.integer({ min: 1, max: 40 }),
      newStep: fc.integer({ min: 1, max: 40 }),
      open: fc.boolean(),
    }),
    { maxLength: 8 },
  )
  .map((steps) => {
    let oldStart = 0;
    let newStart = 0;

    return steps.map(({ oldStep, newStep, open }): Run => {
      oldStart += oldStep;
      newStart += newStep;

      return { oldStart, newStart, open };
    });
  });

function placesOf(hunks: readonly Run[]): { oldStart: number; newStart: number }[] {
  return hunks.map(({ oldStart, newStart }) => ({ oldStart, newStart }));
}

function movedBy(run: Run, version: Version, shift: number): Run {
  return version === "oldStart"
    ? { ...run, oldStart: run.oldStart + shift }
    : { ...run, newStart: run.newStart + shift };
}

function increasing(starts: readonly number[]): boolean {
  return starts.every((start, index) => start > (starts[index - 1] ?? 0));
}

// Hunks as they were, and as they are once one of them, if any, is gone, as once it's staged or
// discarded, and those from some index on have moved in one version, but not to where any hunk
// started in it before, as once lines are added or removed above them.
const changed = fc
  .record({
    before: runs,
    version: fc.constantFrom<Version>("oldStart", "newStart"),
    removing: fc.option(fc.nat()),
    from: fc.nat(),
    shift: fc.integer({ min: -60, max: 60 }),
  })
  .map(({ before, version, removing, from, shift }) => {
    const removed = removing === null || before.length === 0 ? undefined : removing % before.length;

    const kept = before.filter((_, index) => index !== removed);
    const start = from % (kept.length + 1);
    const starts = new Set(before.map((run) => run[version]));

    const after = kept.map((run, index) => (index < start ? run : movedBy(run, version, shift)));
    const moved = shift === 0 ? [] : after.slice(start);

    return {
      before,
      after,
      fits: increasing(after.map((run) => run[version])),
      moved,
      starts,
      version,
    };
  })
  .filter(
    ({ fits, moved, starts, version }) => fits && moved.every((run) => !starts.has(run[version])),
  );

test("a hunk's run of unchanged lines stays open, and the others' closed, as another hunk goes and those after it move in one version", () => {
  fc.assert(
    fc.property(changed, ({ before, after }) => {
      const carried = carriedTo({ entire: false, runs: before }, placesOf(after));

      expect(carried).toStrictEqual({ entire: false, runs: after });
    }),
  );
});

test("a hunk that wasn't there before has its run of unchanged lines closed", () => {
  const before = [
    { oldStart: 10, newStart: 10, open: true },
    { oldStart: 50, newStart: 50, open: true },
  ];

  const after = [
    { oldStart: 10, newStart: 10 },
    { oldStart: 30, newStart: 30 },
    { oldStart: 50, newStart: 52 },
  ];

  expect(
    carriedTo({ entire: false, runs: before }, after).runs.map(({ open }) => open),
  ).toStrictEqual([true, false, true]);
});

test("where as many hunks start where they did in either version, a run stays open by where its hunk starts in the old one, which a change to the worktree leaves as it was", () => {
  const before = [
    { oldStart: 1, newStart: 10, open: true },
    { oldStart: 31, newStart: 40, open: false },
  ];

  expect(
    carriedTo({ entire: false, runs: before }, [{ oldStart: 31, newStart: 10 }]),
  ).toStrictEqual({
    entire: false,
    runs: [{ oldStart: 31, newStart: 10, open: false }],
  });
});

test("the entire file stays shown as the hunks change", () => {
  fc.assert(
    fc.property(runs, runs, (before, after) => {
      expect(carriedTo({ entire: true, runs: before }, placesOf(after)).entire).toBe(true);
    }),
  );
});

const closed: ShownRuns = {
  entire: false,
  runs: [
    { oldStart: 10, newStart: 10, open: false },
    { oldStart: 50, newStart: 50, open: false },
    { oldStart: 90, newStart: 90, open: false },
  ],
};

test("opening the run of unchanged lines above a hunk shows it, and leaves the others as they were", () => {
  const opened = openedAbove(closed, 1);

  expect([0, 1, 2].map((index) => showsAbove(opened, index))).toStrictEqual([false, true, false]);
  expect(openedAbove(openedAbove(closed, 1), 2).runs.map(({ open }) => open)).toStrictEqual([
    false,
    true,
    true,
  ]);

  expect(openedAbove({ ...closed, entire: true }, 1).entire).toBe(true);
  expect(showsAny(closed)).toBe(false);
  expect(showsAny(opened)).toBe(true);
});

test("showing the entire file shows every run of unchanged lines, those after the last hunk too, and leaves those opened as they were", () => {
  const opened = openedAbove(closed, 1);
  const entire = toggledEntire(opened);

  expect(entire.entire).toBe(true);
  expect(entire.runs).toStrictEqual(opened.runs);
  expect([0, 1, 2, 3].map((index) => showsAbove(entire, index))).toStrictEqual([
    true,
    true,
    true,
    true,
  ]);

  expect(showsAny(entire)).toBe(true);
});

test("showing only the hunks again closes every run of unchanged lines, those opened before the entire file showed too", () => {
  const hunks = toggledEntire(toggledEntire(openedAbove(closed, 1)));

  expect(hunks).toStrictEqual(closed);
  expect(showsAny(hunks)).toBe(false);
});

function lines(text: string): NumberedLine[] {
  return [{ kind: "context", text, newline: true, runs: [], oldNumber: 1, newNumber: 1 }];
}

const unchanged = {
  before: lines("before the first"),
  after: [lines("after the first"), lines("after the second"), lines("after the last")],
};

test("the unchanged lines that show are the runs above the hunks that are open, and those after the last only while the entire file shows", () => {
  expect(shownLines(unchanged, closed)).toStrictEqual({ before: [], after: [[], [], []] });
  expect(shownLines(unchanged, openedAbove(closed, 0))).toStrictEqual({
    before: unchanged.before,
    after: [[], [], []],
  });

  expect(shownLines(unchanged, openedAbove(closed, 2))).toStrictEqual({
    before: [],
    after: [[], unchanged.after[1], []],
  });

  expect(shownLines(unchanged, toggledEntire(closed))).toStrictEqual(unchanged);
});
