import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { NumberedLine } from "./lines";
import type { LineRange } from "./selection";
import {
  fileId,
  focusedId,
  hunkId,
  isSelected,
  lineId,
  onSide,
  rangeIn,
  rangeInHunk,
  rangeKey,
  rangeLines,
  selectedInHunk,
  selectedLines,
  selectedRange,
  unchangedLineId,
  unfocusedId,
} from "./selection";
import type { Side } from "./side-by-side";

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

test("a hunk's id is no line's or file's, and tells the file's hunks apart", () => {
  const file = fileId("«r1»", 2);
  const ids = [hunkId(file, 0), hunkId(file, 1), file, lineId(file, 0, 0), lineId(file, 1, 0)];

  expect(new Set(ids).size).toBe(ids.length);
  expect(selectedRange("«r1»", [hunkId(file, 1)], hunkId(file, 1))).toBeUndefined();
});

test("a line on the side without focus has an id of its own, which a selection doesn't find it by", () => {
  const file = fileId("«r1»", 2);

  expect(lineId(file, 1, 3, false)).not.toBe(lineId(file, 1, 3));
  expect(selectedRange("«r1»", [lineId(file, 1, 3, false)], "")).toBeUndefined();
});

// A line outside the hunks, with its number in each version.
function unchangedLine(oldNumber: number, newNumber: number): NumberedLine {
  return { kind: "context", text: "kept", newline: true, runs: [], oldNumber, newNumber };
}

test("a line outside the hunks has an id on each side no other line has, by its number in the new version, which a selection leaves out", () => {
  const file = fileId("«r1»", 2);
  const unchanged = unchangedLineId(file, unchangedLine(3, 1));

  const ids = [
    unchanged,
    unchangedLineId(file, unchangedLine(3, 1), false),
    unchangedLineId(file, unchangedLine(1, 3)),
    lineId(file, 0, 1),
    lineId(file, 1, 3),
    hunkId(file, 1),
    file,
  ];

  expect(new Set(ids).size).toBe(ids.length);
  expect(unchangedLineId(file, unchangedLine(5, 1))).toBe(unchanged);
  expect(selectedRange("«r1»", ids.slice(0, 3), unchanged)).toBeUndefined();
});

test("a line's id on either side is the one the side with focus has", () => {
  const file = fileId("«r1»", 2);

  expect(focusedId(lineId(file, 1, 3, false))).toBe(lineId(file, 1, 3));
  expect(focusedId(unchangedLineId(file, unchangedLine(2, 2), false))).toBe(
    unchangedLineId(file, unchangedLine(2, 2)),
  );

  fc.assert(
    fc.property(fc.string({ unit: "binary" }), (id) => {
      expect(focusedId(unfocusedId(id))).toBe(id);
      expect(unfocusedId(id)).not.toBe(id);
    }),
  );
});

test.each(["«r1»:2:13", "«r1»:2:new 4", "«r1»:unfocused:2", "«r1»:2:13:unfocused:x"])(
  "%s is a line's id on the side with focus",
  (id) => {
    expect(focusedId(id)).toBe(id);
  },
);

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

const oldSide: LineRange = { ...range, side: "old" };

test.each<[LineRange, number, Side | undefined, boolean]>([
  [oldSide, 3, "old", true],
  [oldSide, 3, "new", false],
  [oldSide, 3, undefined, false],
  [oldSide, 5, "old", false],
  [range, 3, "old", false],
])("%j has line 1:%i shown on the %s side: %s", (shown, line, side, selected) => {
  expect(isSelected(shown, 1, line, side)).toBe(selected);
});

// What a view that shows the same of each file shows.
function showsTheSame(): string {
  return "a 1";
}

test.each<[LineRange, boolean]>([
  [{ file: 0, hunk: 1, first: 2, last: 4 }, true],
  [{ file: 1, hunk: 1, first: 2, last: 4 }, false],
  [{ file: 0, hunk: 0, first: 2, last: 4 }, false],
  [{ file: 0, hunk: 1, first: 3, last: 4 }, false],
  [{ file: 0, hunk: 1, first: 2, last: 3 }, false],
])(
  "what's selected of lines 2 to 4 of hunk 1 of the first file stays the same once the selection touches %j, while every file shows the same: %s",
  (next, same) => {
    const selected = selectedLines(undefined, range, showsTheSame);

    expect(selectedLines(selected, next, showsTheSame) === selected).toBe(same);
  },
);

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

test("gives each of a file's hunks only the range of its own lines, as it is", () => {
  const selected = { file: 1, hunk: 2, first: 3, last: 4 };

  expect(rangeInHunk(selected, 2)).toBe(selected);
  expect(rangeInHunk(selected, 1)).toBeUndefined();
  expect(rangeInHunk(undefined, 0)).toBeUndefined();
});

// A hunk's lines of each kind, in the order git gives them.
const mixed = (
  ["context", "removed", "removed", "added", "added", "context", "removed", "added"] as const
).map((kind) => ({ kind, text: kind, newline: true, runs: [] }));

test("names each of a range's lines by its hunk's index and its own", () => {
  expect(rangeLines({ file: 1, hunk: 2, first: 2, last: 6 }, mixed)).toStrictEqual([
    { hunk: 2, line: 2 },
    { hunk: 2, line: 3 },
    { hunk: 2, line: 4 },
    { hunk: 2, line: 5 },
    { hunk: 2, line: 6 },
  ]);
});

test("names only the lines its side shows of a range on one side", () => {
  expect(rangeLines({ file: 1, hunk: 2, first: 0, last: 6, side: "old" }, mixed)).toStrictEqual([
    { hunk: 2, line: 0 },
    { hunk: 2, line: 1 },
    { hunk: 2, line: 2 },
    { hunk: 2, line: 5 },
    { hunk: 2, line: 6 },
  ]);
  expect(rangeLines({ file: 1, hunk: 2, first: 1, last: 7, side: "new" }, mixed)).toStrictEqual([
    { hunk: 2, line: 3 },
    { hunk: 2, line: 4 },
    { hunk: 2, line: 5 },
    { hunk: 2, line: 7 },
  ]);
});

test("puts a range on the side with focus, and leaves it as it is inline", () => {
  const focus = { side: "old" as const, onFocus: () => {} };

  expect(onSide(range, focus)).toStrictEqual({ ...range, side: "old" });
  expect(onSide(range)).toBe(range);
  expect(onSide(undefined, focus)).toBeUndefined();
});

test("gives a hunk of the view's file only the range of its own lines, on the side with focus", () => {
  const selected = { file: 1, hunk: 2, first: 3, last: 4 };
  const focus = { side: "new" as const, onFocus: () => {} };

  expect(selectedInHunk(selected, focus, 1, 2)).toStrictEqual({ ...selected, side: "new" });
  expect(selectedInHunk(selected, undefined, 1, 2)).toBe(selected);
  expect(selectedInHunk(selected, focus, 0, 2)).toBeUndefined();
  expect(selectedInHunk(selected, focus, 1, 1)).toBeUndefined();
});

test("tells apart ranges of a hunk with other lines, or on another side", () => {
  const keys = [
    rangeKey(range),
    rangeKey({ ...range, side: "old" }),
    rangeKey({ ...range, side: "new" }),
    rangeKey({ ...range, first: 3 }),
    rangeKey({ ...range, last: 5 }),
  ];

  expect(new Set(keys).size).toBe(keys.length);
});
