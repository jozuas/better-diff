import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { NumberedLine } from "./lines";
import {
  carriedTo,
  closedAbove,
  firstShownAbove,
  openedAbove,
  runShown,
  showsAny,
  shownLines,
  toggledEntire,
  unchangedAction,
  upToShow,
} from "./runs";
import type { ShownRuns } from "./runs";

type Version = "oldStart" | "newStart";

// No runs of unchanged lines with a line commented on.
const none: ReadonlySet<number> = new Set();

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

  expect([0, 1, 2].map((index) => runShown(opened, index, none))).toStrictEqual([
    "hidden",
    "open",
    "hidden",
  ]);
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
  expect([0, 1, 2, 3].map((index) => runShown(entire, index, none))).toStrictEqual([
    "open",
    "open",
    "open",
    "open",
  ]);

  expect(showsAny(entire)).toBe(true);
});

test("showing only the hunks again closes every run of unchanged lines, those opened before the entire file showed too", () => {
  const hunks = toggledEntire(toggledEntire(openedAbove(closed, 1)));

  expect(hunks).toStrictEqual(closed);
  expect(showsAny(hunks)).toBe(false);
});

// Runs of unchanged lines above hunks, some of them open, and the index of one of the hunks.
const runAt = runs
  .filter((hunks) => hunks.length > 0)
  .chain((hunks) => fc.tuple(fc.constant(hunks), fc.nat({ max: hunks.length - 1 })));

test("hiding the run of unchanged lines above a hunk hides only it, and hiding one just shown leaves the file as it was", () => {
  fc.assert(
    fc.property(runAt, ([hunks, index]) => {
      const shown = { entire: false, runs: hunks };
      const hidden = closedAbove(shown, index);

      expect(hidden.entire).toBe(false);
      expect(placesOf(hidden.runs)).toStrictEqual(placesOf(hunks));
      expect(hidden.runs.map(({ open }) => open)).toStrictEqual(
        hunks.map(({ open }) => open).with(index, false),
      );
      expect(closedAbove(openedAbove(hidden, index), index)).toStrictEqual(hidden);
    }),
  );
});

test("hiding the run of unchanged lines above a hunk while the entire file shows leaves the runs above the other hunks shown, but not the lines after the last hunk", () => {
  fc.assert(
    fc.property(runAt, ([hunks, index]) => {
      const hidden = closedAbove({ entire: true, runs: hunks }, index);

      expect(hidden.entire).toBe(false);
      expect(hunks.map((_, at) => runShown(hidden, at, none))).toStrictEqual(
        hunks.map(() => "open").with(index, "hidden"),
      );
      expect(runShown(hidden, hunks.length, none)).toBe("hidden");
    }),
  );
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

test("a run of unchanged lines shown above a hunk with some of its lines in sight leaves the view as it is", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 100 }),
      fc.integer({ min: 1, max: 1000 }),
      fc.integer({ min: 1, max: 1000 }),
      fc.integer({ min: 0, max: 1000 }),
      (ceiling, below, tall, middle) => {
        const bar = ceiling + below;

        expect(upToShow({ first: bar - tall, bar, ceiling, middle })).toBe(0);
        expect(upToShow({ first: undefined, bar, ceiling, middle })).toBe(0);
      },
    ),
  );
});

test("a run of unchanged lines shown above a hunk out of sight scrolls into it, all of it under the bars at the view's top, or as much as fits with the hunk's bar no lower than the view's middle", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 100 }),
      fc.integer({ min: 0, max: 1000 }),
      fc.integer({ min: 1, max: 2000 }),
      fc.integer({ min: 0, max: 1000 }),
      (ceiling, above, tall, lower) => {
        const bar = ceiling - above;
        const first = bar - tall;
        const middle = ceiling + lower;
        const up = upToShow({ first, bar, ceiling, middle });

        expect(first + up).toBeLessThanOrEqual(ceiling);
        expect(bar + up).toBeLessThanOrEqual(middle);
        expect(Math.min(ceiling - first - up, middle - bar - up)).toBe(0);
      },
    ),
  );
});

test("a run of unchanged lines shown above a hunk out of sight, whose first line isn't rendered, scrolls into sight with the hunk's bar at the view's middle", () => {
  expect(upToShow({ first: undefined, bar: 30, ceiling: 40, middle: 300 })).toBe(270);
  expect(upToShow({ first: -500, bar: 30, ceiling: 40, middle: 300 })).toBe(270);
  expect(upToShow({ first: -100, bar: 40, ceiling: 40, middle: 300 })).toBe(140);
});

test("a view no taller than the bars at its top scrolls no way for a run of unchanged lines out of sight", () => {
  expect(upToShow({ first: -100, bar: 40, ceiling: 40, middle: 20 })).toBe(0);
});

test("the first of the unchanged lines that show above a hunk is the first before the first hunk, or after the hunk before it, and none while none show", () => {
  const before = lines("before the first");
  const between = lines("after the first");
  const after = lines("after the second");
  const around = { before, after: [between, after] };

  expect(firstShownAbove(around, 0)).toBe(before[0]);
  expect(firstShownAbove(around, 1)).toBe(between[0]);
  expect(firstShownAbove(around, 2)).toBe(after[0]);
  expect(firstShownAbove({ before: [], after: [[], after] }, 1)).toBeUndefined();
  expect(firstShownAbove(around, 3)).toBeUndefined();
});

test.each([
  [27, "hidden", "open"],
  [1, "hidden", "open"],
  [27, "open", "close"],
  [1, "open", "close"],
  [27, "kept", undefined],
  [0, "hidden", undefined],
  [0, "open", undefined],
] as const)(
  "with %i unchanged lines above a hunk, %s, showing or hiding them does %j",
  (count, shown, action) => {
    expect(unchangedAction(count, shown)).toBe(action);
  },
);

test("a run of unchanged lines with a line commented on is kept shown, and else is open while it shows, as while the entire file shows, and hidden while it doesn't", () => {
  const opened = openedAbove(closed, 1);

  expect([0, 1, 2].map((index) => runShown(opened, index, new Set([2])))).toStrictEqual([
    "hidden",
    "open",
    "kept",
  ]);
  expect(runShown(toggledEntire(closed), 0, new Set())).toBe("open");
  expect(runShown(toggledEntire(closed), 0, new Set([0]))).toBe("kept");
});
