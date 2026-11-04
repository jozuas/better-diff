import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { TextRange } from "./changed-text";
import { numberLines } from "./lines";
import { runsOf, schemeOf, segmentsOf } from "./syntax";
import type { Highlights, Segment, SyntaxColors } from "./syntax";

// Among them one named "null", which a run without a style isn't.
const styles = ["keyword", "string", "comment", "variable", "null"];

// Runs that may stop short of the text or go past its end, without a style or of styles with a
// colour or without one, and with the same colour as another.
const runs = fc.array(
  fc.tuple(fc.integer({ min: 1, max: 6 }), fc.option(fc.constantFrom(...styles))),
);

const colors: fc.Arbitrary<SyntaxColors> = fc.dictionary(
  fc.constantFrom(...styles),
  fc.constantFrom("#111111", "#222222"),
);

// Ranges of changed text, in order, apart from each other, some of them past the text's end.
const changes: fc.Arbitrary<TextRange[]> = fc
  .uniqueArray(fc.nat({ max: 12 }), { maxLength: 6 })
  .map((bounds) => {
    const sorted = bounds.toSorted((one, other) => one - other);

    return Array.from({ length: Math.floor(sorted.length / 2) }, (_, index) => ({
      start: sorted[2 * index] ?? 0,
      end: sorted[2 * index + 1] ?? 0,
    }));
  });

// The colour of each of the text's characters, by JavaScript's count: its run's style's, or none
// past the runs.
function colorsOfCharacters(
  text: string,
  textRuns: readonly (readonly [number, string | null])[],
  styleColors: SyntaxColors,
): (string | undefined)[] {
  const characters: (string | undefined)[] = [];

  for (const [length, style] of textRuns) {
    characters.push(
      ...Array.from({ length }, () => (style === null ? undefined : styleColors[style])),
    );
  }

  return Array.from({ length: text.length }, (_, index) => characters[index]);
}

function isChangedAt(ranges: readonly TextRange[], at: number): boolean {
  return ranges.some(({ start, end }) => start <= at && at < end);
}

// The segments with both the colour of the one before them and whether it's changed.
function likeTheOneBefore(segments: readonly Segment[]): Segment[] {
  return segments
    .slice(1)
    .filter(
      ({ color, changed }, index) =>
        color === segments[index]?.color && changed === segments[index]?.changed,
    );
}

// Text, runs, colours and changed text to make segments of.
const segmented = fc.tuple(fc.string({ unit: "binary" }), runs, colors, changes);

test("the segments make up the text, each starting where the ones before it end", () => {
  fc.assert(
    fc.property(segmented, ([text, textRuns, styleColors, ranges]) => {
      const segments = segmentsOf(text, textRuns, styleColors, ranges);

      expect(segments.map((segment) => segment.text).join("")).toBe(text);
      expect(segments.map((segment) => segment.start)).toStrictEqual(
        segments.map(
          (_, index) =>
            segments
              .slice(0, index)
              .map((segment) => segment.text)
              .join("").length,
        ),
      );
    }),
  );
});

test("each of the text's characters is in the colour of its run's style, or the text's own past the runs or where the style has none", () => {
  fc.assert(
    fc.property(segmented, ([text, textRuns, styleColors, ranges]) => {
      const segments = segmentsOf(text, textRuns, styleColors, ranges);

      expect(
        segments.flatMap(({ text: piece, color }) =>
          Array.from({ length: piece.length }, () => color),
        ),
      ).toStrictEqual(colorsOfCharacters(text, textRuns, styleColors));
    }),
  );
});

test("each of the text's characters is changed where a range of changed text has it", () => {
  fc.assert(
    fc.property(segmented, ([text, textRuns, styleColors, ranges]) => {
      const segments = segmentsOf(text, textRuns, styleColors, ranges);

      expect(
        segments.flatMap(({ start, text: piece, changed }) =>
          Array.from({ length: piece.length }, (_, index) => [start + index, changed]),
        ),
      ).toStrictEqual(
        Array.from({ length: text.length }, (_, at) => [at, isChangedAt(ranges, at)]),
      );
    }),
  );
});

test("no segment is empty, and none has both the colour of the one before it and whether it's changed", () => {
  fc.assert(
    fc.property(segmented, ([text, textRuns, styleColors, ranges]) => {
      const segments: Segment[] = segmentsOf(text, textRuns, styleColors, ranges);

      expect(segments.filter((segment) => segment.text === "")).toStrictEqual([]);
      expect(likeTheOneBefore(segments)).toStrictEqual([]);
    }),
  );
});

test("a line's runs are its version's where its number there says: a removed line's the old version's, an added or unchanged line's the new one's", () => {
  const highlights: Highlights = {
    old: [[[1, "old 1"]], [[1, "old 2"]], [[1, "old 3"]]],
    new: [[[1, "new 1"]], [[1, "new 2"]], [[1, "new 3"]]],
  };

  const lines = numberLines({
    oldStart: 2,
    newStart: 1,
    lines: [
      { kind: "removed", text: "a", newline: true },
      { kind: "added", text: "b", newline: true },
      { kind: "context", text: "c", newline: true },
    ],
  });

  expect(lines.map((line) => runsOf(line, highlights))).toStrictEqual([
    [[1, "old 2"]],
    [[1, "new 1"]],
    [[1, "new 2"]],
  ]);
});

test("a line has no runs where its version has no highlights", () => {
  const lines = numberLines({
    oldStart: 1,
    newStart: 1,
    lines: [
      { kind: "removed", text: "a", newline: true },
      { kind: "added", text: "b", newline: true },
    ],
  });

  expect(lines.map((line) => runsOf(line, { old: [], new: [] }))).toStrictEqual([[], []]);
});

function grey(value: number): string {
  return `#${value.toString(16).padStart(2, "0").repeat(3)}`;
}

test("a grey background is light from middle grey, #808080, up", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0x80, max: 0xff }), (value) => {
      expect(schemeOf(grey(value))).toBe("light");
    }),
    { examples: [[0x80]] },
  );
});

test("a grey background darker than middle grey, #808080, is dark", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 0x7f }), (value) => {
      expect(schemeOf(grey(value))).toBe("dark");
    }),
    { examples: [[0x7f]] },
  );
});

test.each([
  ["#ffffff", "light"],
  ["#181B1A", "dark"],
  ["#00ff00", "light"],
  ["#ff0000", "dark"],
  ["#0000ff", "dark"],
  ["#ff00ff", "dark"],
  ["#00ffff", "light"],
])(
  "weighs a background's red, green and blue as the eye does, green the most and blue the least: %s is %s",
  (background, scheme) => {
    expect(schemeOf(background)).toBe(scheme);
  },
);
