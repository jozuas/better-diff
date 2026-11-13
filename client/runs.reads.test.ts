import * as fc from "fast-check";
import { expect, test } from "vitest";

import { carriedOver, carriedTo, entireShown, openedAbove } from "./runs";

const version = fc.string({ unit: "binary" });

const read = fc.record({ version });

test("a read of the entire file shows once it's of the version of the diff shown, whether one showed before or not", () => {
  fc.assert(
    fc.property(read, fc.boolean(), (entire, showing) => {
      expect(entireShown(entire, entire.version, showing)).toBe(entire);
    }),
  );
});

test("a read of the entire file of another version than the diff shown doesn't start to show", () => {
  fc.assert(
    fc.property(read, version, (entire, shown) => {
      fc.pre(shown !== entire.version);

      expect(entireShown(entire, shown, false)).toBeUndefined();
    }),
  );
});

test("once a read of the entire file shows, the one read last shows, of whichever version", () => {
  fc.assert(
    fc.property(read, version, (entire, shown) => {
      expect(entireShown(entire, shown, true)).toBe(entire);
    }),
  );
});

test("the entire file doesn't show until it's read", () => {
  fc.assert(
    fc.property(version, fc.boolean(), (shown, showing) => {
      expect(entireShown(undefined, shown, showing)).toBeUndefined();
    }),
  );
});

const before = [
  { oldStart: 10, newStart: 10 },
  { oldStart: 50, newStart: 50 },
];

const openAbove50 = {
  hunks: before,
  shown: openedAbove(carriedTo({ entire: false, runs: [] }, before), 1),
};

test("runs carried over to the hunks they were carried over to last stay as they are, so what's rendered with them isn't rendered again", () => {
  expect(carriedOver(openAbove50, before)).toBe(openAbove50);
});

test("runs carried over to the hunks of another read, with a hunk added above the others, keep the run open above the hunk it was open above", () => {
  const after = [
    { oldStart: 1, newStart: 1 },
    { oldStart: 10, newStart: 11 },
    { oldStart: 50, newStart: 51 },
  ];

  const carried = carriedOver(openAbove50, after);

  expect(carried.hunks).toBe(after);
  expect(carried.shown.runs.map((run) => run.open)).toStrictEqual([false, false, true]);
});
