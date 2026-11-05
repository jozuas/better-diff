import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { TextRange } from "./changed-text";
import { schemeOf, segmentsOf } from "./syntax";
import type { Mark, Segment, SyntaxColors } from "./syntax";

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

// What the character at the position is marked as: trailing whitespace from where that starts, and
// before it, changed where a range of changed text has it.
function markAt(ranges: readonly TextRange[], trailing: number, at: number): Mark | undefined {
  if (at >= trailing) {
    return "trailing whitespace";
  }

  return ranges.some(({ start, end }) => start <= at && at < end) ? "changed" : undefined;
}

// The segments with both the colour of the one before them and its mark.
function likeTheOneBefore(segments: readonly Segment[]): Segment[] {
  return segments
    .slice(1)
    .filter(
      ({ color, mark }, index) =>
        color === segments[index]?.color && mark === segments[index]?.mark,
    );
}

// Text, runs, colours, changed text and where trailing whitespace starts, to make segments of. It
// starts anywhere up to past the text's end.
const segmented = fc.tuple(
  fc.string({ unit: "binary" }),
  runs,
  colors,
  changes,
  fc.nat({ max: 14 }),
);

test("the segments make up the text, each starting where the ones before it end", () => {
  fc.assert(
    fc.property(segmented, ([text, textRuns, styleColors, ranges, trailing]) => {
      const segments = segmentsOf(text, textRuns, styleColors, ranges, trailing);

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
    fc.property(segmented, ([text, textRuns, styleColors, ranges, trailing]) => {
      const segments = segmentsOf(text, textRuns, styleColors, ranges, trailing);

      expect(
        segments.flatMap(({ text: piece, color }) =>
          Array.from({ length: piece.length }, () => color),
        ),
      ).toStrictEqual(colorsOfCharacters(text, textRuns, styleColors));
    }),
  );
});

test("each of the text's characters is trailing whitespace from where that starts, and before it, changed where a range of changed text has it", () => {
  fc.assert(
    fc.property(segmented, ([text, textRuns, styleColors, ranges, trailing]) => {
      const segments = segmentsOf(text, textRuns, styleColors, ranges, trailing);

      expect(
        segments.flatMap(({ start, text: piece, mark }) =>
          Array.from({ length: piece.length }, (_, index) => [start + index, mark]),
        ),
      ).toStrictEqual(
        Array.from({ length: text.length }, (_, at) => [at, markAt(ranges, trailing, at)]),
      );
    }),
  );
});

test("no segment is empty, and none has both the colour of the one before it and its mark", () => {
  fc.assert(
    fc.property(segmented, ([text, textRuns, styleColors, ranges, trailing]) => {
      const segments: Segment[] = segmentsOf(text, textRuns, styleColors, ranges, trailing);

      expect(segments.filter((segment) => segment.text === "")).toStrictEqual([]);
      expect(likeTheOneBefore(segments)).toStrictEqual([]);
    }),
  );
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
