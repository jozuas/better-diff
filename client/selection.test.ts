import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { LineRange } from "./selection";
import { isSelected, lineId, rangeLines, sameRange, selectedRange } from "./selection";

// A diff's hunks and a drag over their lines, upwards or downwards: the ids of the lines it touches,
// in the page's order, and of the one it starts in.
const drag = fc
  .record({
    container: fc.string({ unit: "binary", minLength: 1 }),
    hunks: fc.array(fc.integer({ min: 1, max: 30 }), { minLength: 1, maxLength: 4 }),
    start: fc.nat(),
    extent: fc.nat(),
    upwards: fc.boolean(),
  })
  .map(({ container, hunks, start, extent, upwards }) => {
    const lines = hunks.flatMap((length, hunk) =>
      Array.from({ length }, (_, line) => ({ hunk, line })),
    );

    const first = start % lines.length;
    const touched = lines.slice(first, first + 1 + (extent % (lines.length - first)));
    const from = (upwards ? touched.at(-1) : touched[0]) ?? { hunk: 0, line: 0 };
    const kept = touched.flatMap(({ hunk, line }) => (hunk === from.hunk ? [line] : []));

    return {
      container,
      touched: touched.map(({ hunk, line }) => lineId(container, hunk, line)),
      anchor: lineId(container, from.hunk, from.line),
      // The lines of the hunk the drag starts in, as far as it goes in that hunk.
      range: { hunk: from.hunk, first: kept[0], last: kept.at(-1) },
    };
  });

test("selects the lines a drag touches, only in the hunk it starts in", () => {
  fc.assert(
    fc.property(drag, ({ container, touched, anchor, range }) => {
      expect(selectedRange(container, touched, anchor)).toStrictEqual(range);
    }),
  );
});

test("ignores the ids of elements that aren't the container's lines, and else selects in the first hunk touched", () => {
  const touched = ["«r2»:0:1", "«r1»:x0:1", "«r1»:0:1x", "«r1»", "«r1»:0", "«r1»:0:1:2"];

  expect(selectedRange("«r1»", [...touched, lineId("«r1»", 10, 12)], "sidebar")).toStrictEqual({
    hunk: 10,
    first: 12,
    last: 12,
  });
  expect(selectedRange("«r1»", [lineId("«r1»", 0, 3), lineId("«r1»", 1, 0)], "")).toStrictEqual({
    hunk: 0,
    first: 3,
    last: 3,
  });
});

test("selects in the first hunk touched when the selection touches no line of the one it starts in", () => {
  expect(
    selectedRange("«r1»", [lineId("«r1»", 1, 4), lineId("«r1»", 2, 0)], lineId("«r1»", 0, 7)),
  ).toStrictEqual({ hunk: 1, first: 4, last: 4 });
});

test("selects nothing when the selection touches no line", () => {
  expect(selectedRange("«r1»", [], "")).toBeUndefined();
  expect(selectedRange("«r1»", ["sidebar"], "sidebar")).toBeUndefined();
});

const range: LineRange = { hunk: 1, first: 2, last: 4 };

test.each([
  [1, 2, true],
  [1, 4, true],
  [1, 1, false],
  [1, 5, false],
  [0, 3, false],
])("a range of lines 2 to 4 of hunk 1 has line %i:%i: %s", (hunk, line, selected) => {
  expect(isSelected(range, hunk, line)).toBe(selected);
});

test("no line is selected without a range", () => {
  expect(isSelected(undefined, 0, 0)).toBe(false);
});

test.each<[LineRange | undefined, LineRange | undefined, boolean]>([
  [range, { hunk: 1, first: 2, last: 4 }, true],
  [range, { hunk: 0, first: 2, last: 4 }, false],
  [range, { hunk: 1, first: 3, last: 4 }, false],
  [range, { hunk: 1, first: 2, last: 3 }, false],
  [range, undefined, false],
  [undefined, range, false],
  [undefined, undefined, true],
])("%j is the same range as %j: %s", (one, other, same) => {
  expect(sameRange(one, other)).toBe(same);
});

test("names each of a range's lines by its hunk's index and its own", () => {
  expect(rangeLines({ hunk: 2, first: 3, last: 5 })).toStrictEqual([
    { hunk: 2, line: 3 },
    { hunk: 2, line: 4 },
    { hunk: 2, line: 5 },
  ]);
});
