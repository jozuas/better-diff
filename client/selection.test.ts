import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { LineRange } from "./selection";
import {
  fileId,
  isSelected,
  lineId,
  rangeIn,
  rangeLines,
  sameRange,
  selectedRange,
} from "./selection";

interface Line {
  file: number;
  hunk: number;
  line: number;
}

function idOf(view: string, { file, hunk, line }: Line): string {
  return lineId(fileId(view, file), hunk, line);
}

// A view's files, each with its hunks, and a drag over their lines, upwards or downwards: the ids of
// the lines it touches, in the page's order, and of the one it starts in.
const drag = fc
  .record({
    view: fc.string({ unit: "binary", minLength: 1 }),
    files: fc.array(fc.array(fc.integer({ min: 1, max: 12 }), { minLength: 1, maxLength: 3 }), {
      minLength: 1,
      maxLength: 3,
    }),
    start: fc.nat(),
    extent: fc.nat(),
    upwards: fc.boolean(),
  })
  .map(({ view, files, start, extent, upwards }) => {
    const lines = files.flatMap((hunks, file) =>
      hunks.flatMap((length, hunk) => Array.from({ length }, (_, line) => ({ file, hunk, line }))),
    );

    const first = start % lines.length;
    const touched = lines.slice(first, first + 1 + (extent % (lines.length - first)));
    const from = (upwards ? touched.at(-1) : touched[0]) ?? { file: 0, hunk: 0, line: 0 };

    const kept = touched.flatMap(({ file, hunk, line }) =>
      file === from.file && hunk === from.hunk ? [line] : [],
    );

    return {
      view,
      touched: touched.map((line) => idOf(view, line)),
      anchor: idOf(view, from),
      // The lines of the hunk the drag starts in, as far as it goes in that hunk.
      range: { file: from.file, hunk: from.hunk, first: kept[0], last: kept.at(-1) },
    };
  });

test("selects the lines a drag touches, only in the hunk of the file it starts in", () => {
  fc.assert(
    fc.property(drag, ({ view, touched, anchor, range }) => {
      expect(selectedRange(view, touched, anchor)).toStrictEqual(range);
    }),
  );
});

test("a drag from a file's hunk into the hunk of the same index of the next file stays in the file it starts in", () => {
  const from = lineId(fileId("«r1»", 0), 1, 5);
  const to = lineId(fileId("«r1»", 1), 1, 0);

  expect(selectedRange("«r1»", [from, to], from)).toStrictEqual({
    file: 0,
    hunk: 1,
    first: 5,
    last: 5,
  });
  expect(selectedRange("«r1»", [from, to], to)).toStrictEqual({
    file: 1,
    hunk: 1,
    first: 0,
    last: 0,
  });
});

test("ignores the ids of elements that aren't the view's lines, and else selects in the first hunk touched", () => {
  const touched = [
    "«r2»:0:0:1",
    "«r1»:0:x0:1",
    "«r1»:0:0:1x",
    "«r1»",
    fileId("«r1»", 0),
    "«r1»:0:1",
    "«r1»:0:0:1:2",
  ];

  expect(
    selectedRange("«r1»", [...touched, lineId(fileId("«r1»", 13), 10, 12)], "sidebar"),
  ).toStrictEqual({ file: 13, hunk: 10, first: 12, last: 12 });

  expect(
    selectedRange("«r1»", [lineId(fileId("«r1»", 0), 0, 3), lineId(fileId("«r1»", 0), 1, 0)], ""),
  ).toStrictEqual({ file: 0, hunk: 0, first: 3, last: 3 });
});

test("selects in the first hunk touched when the selection touches no line of the one it starts in", () => {
  const file = fileId("«r1»", 2);

  expect(
    selectedRange("«r1»", [lineId(file, 1, 4), lineId(file, 2, 0)], lineId(file, 0, 7)),
  ).toStrictEqual({ file: 2, hunk: 1, first: 4, last: 4 });
});

test("selects nothing when the selection touches no line", () => {
  expect(selectedRange("«r1»", [], "")).toBeUndefined();
  expect(selectedRange("«r1»", ["sidebar"], "sidebar")).toBeUndefined();
});

const range: LineRange = { file: 0, hunk: 1, first: 2, last: 4 };

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
  [range, { file: 0, hunk: 1, first: 2, last: 4 }, true],
  [range, { file: 1, hunk: 1, first: 2, last: 4 }, false],
  [range, { file: 0, hunk: 0, first: 2, last: 4 }, false],
  [range, { file: 0, hunk: 1, first: 3, last: 4 }, false],
  [range, { file: 0, hunk: 1, first: 2, last: 3 }, false],
  [range, undefined, false],
  [undefined, range, false],
  [undefined, undefined, true],
])("%j is the same range as %j: %s", (one, other, same) => {
  expect(sameRange(one, other)).toBe(same);
});

test("gives each of a view's files only the range of its own lines", () => {
  expect(rangeIn({ file: 1, hunk: 2, first: 3, last: 4 }, 1)).toStrictEqual({
    file: 1,
    hunk: 2,
    first: 3,
    last: 4,
  });
  expect(rangeIn({ file: 1, hunk: 2, first: 3, last: 4 }, 0)).toBeUndefined();
  expect(rangeIn(undefined, 0)).toBeUndefined();
});

test("names each of a range's lines by its hunk's index and its own", () => {
  expect(rangeLines({ file: 1, hunk: 2, first: 3, last: 5 })).toStrictEqual([
    { hunk: 2, line: 3 },
    { hunk: 2, line: 4 },
    { hunk: 2, line: 5 },
  ]);
});
