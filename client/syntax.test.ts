import * as fc from "fast-check";
import { expect, test } from "vitest";

import { lineText } from "../test/line-texts";
import type { TextRange } from "./changed-text";
import type { FoundRange } from "./find";
import { schemeOf, segmentsOf } from "./syntax";
import type { Found, Mark, Segment, SyntaxColors } from "./syntax";

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

// Matches the find bar found, in order, apart from each other or right after each other, some of
// them past the text's end, the current one among them or not.
const finds: fc.Arbitrary<FoundRange[]> = fc
  .tuple(
    fc.array(fc.tuple(fc.nat({ max: 3 }), fc.integer({ min: 1, max: 3 })), { maxLength: 4 }),
    fc.nat({ max: 4 }),
  )
  .map(([pieces, current]) => {
    let end = 0;

    return pieces.map(([gap, length], index) => {
      const start = end + gap;

      end = start + length;

      return { start, end, current: index === current };
    });
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

// What the find bar found the character at the position to be: the current match or a match, where
// one has it.
function foundAt(found: readonly FoundRange[], at: number): Found | undefined {
  const range = found.find(({ start, end }) => start <= at && at < end);

  if (range === undefined) {
    return undefined;
  }

  return range.current ? "current" : "match";
}

// The segments with the colour of the one before them, its mark and what the find bar found it to
// be.
function likeTheOneBefore(segments: readonly Segment[]): Segment[] {
  return segments
    .slice(1)
    .filter(
      ({ color, mark, found }, index) =>
        color === segments[index]?.color &&
        mark === segments[index]?.mark &&
        found === segments[index]?.found,
    );
}

// Text, runs, colours, changed text and where trailing whitespace starts, to make segments of: text
// of code points, or of words and whitespace of every kind. Trailing whitespace starts anywhere up
// to past the text's end.
const segmented = fc.tuple(
  fc.oneof(fc.string({ unit: "binary" }), lineText),
  runs,
  colors,
  changes,
  fc.nat({ max: 14 }),
  finds,
);

// The colour of each of the text's characters in the segments.
function segmentColors(segments: readonly Segment[]): (string | undefined)[] {
  return segments.flatMap(({ text: piece, color }) =>
    Array.from({ length: piece.length }, () => color),
  );
}

function isWhitespace(text: string, at: number): boolean {
  return /^\s$/u.test(text.charAt(at));
}

// The indices of the text's characters whose colour in the segments isn't that of their run's
// style, or the text's own: but for whitespace without a colour, which may take the colour of the
// character before it, if that's marked as it is.
function miscolored(
  text: string,
  segments: readonly Segment[],
  expected: readonly (string | undefined)[],
  markOf: (at: number) => Mark | undefined,
): number[] {
  const actual = segmentColors(segments);

  return expected.flatMap((color, at) => {
    const takesColorBefore =
      color === undefined &&
      isWhitespace(text, at) &&
      at > 0 &&
      actual[at] === actual[at - 1] &&
      markOf(at) === markOf(at - 1);

    return actual[at] === color || takesColorBefore ? [] : [at];
  });
}

// The segments of only whitespace without a colour after a segment marked and found as they are,
// which they could run on from.
function separateWhitespace(segments: readonly Segment[]): Segment[] {
  return segments
    .slice(1)
    .filter(
      ({ text: piece, color, mark, found }, index) =>
        color === undefined &&
        /^\s+$/u.test(piece) &&
        mark === segments[index]?.mark &&
        found === segments[index]?.found,
    );
}

test("the segments make up the text, each starting where the ones before it end", () => {
  fc.assert(
    fc.property(segmented, ([text, textRuns, styleColors, ranges, trailing, found]) => {
      const segments = segmentsOf(text, textRuns, styleColors, ranges, trailing, found);

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

test("each of the text's characters is in the colour of its run's style, or the text's own past the runs or where the style has none, or whitespace without one in that of the text before it", () => {
  fc.assert(
    fc.property(segmented, ([text, textRuns, styleColors, ranges, trailing, found]) => {
      const segments = segmentsOf(text, textRuns, styleColors, ranges, trailing, found);

      expect(
        miscolored(text, segments, colorsOfCharacters(text, textRuns, styleColors), (at) =>
          markAt(ranges, trailing, at),
        ),
      ).toStrictEqual([]);
    }),
    {
      examples: [
        [
          [
            "ab ",
            [
              [1, "keyword"],
              [2, null],
            ],
            { keyword: "#111111" },
            [],
            14,
            [],
          ],
        ],
      ],
    },
  );
});

test("whitespace without a colour runs on from the text before it, where that's marked as it is, rather than starting a segment", () => {
  fc.assert(
    fc.property(segmented, ([text, textRuns, styleColors, ranges, trailing, found]) => {
      expect(
        separateWhitespace(segmentsOf(text, textRuns, styleColors, ranges, trailing, found)),
      ).toStrictEqual([]);
    }),
    {
      examples: [
        [
          [
            "a, {",
            [
              [1, "keyword"],
              [1, "variable"],
              [1, null],
              [1, "variable"],
            ],
            { keyword: "#111111", variable: "#222222" },
            [],
            14,
            [],
          ],
        ],
        [
          [
            "a b",
            [
              [1, "keyword"],
              [1, null],
              [1, "keyword"],
            ],
            { keyword: "#111111" },
            [{ start: 1, end: 2 }],
            14,
            [],
          ],
        ],
        [
          [
            "a  b",
            [
              [1, "keyword"],
              [2, null],
              [1, "keyword"],
            ],
            { keyword: "#111111" },
            [],
            14,
            [],
          ],
        ],
      ],
    },
  );
});

test("each of the text's characters is trailing whitespace from where that starts, and before it, changed where a range of changed text has it", () => {
  fc.assert(
    fc.property(segmented, ([text, textRuns, styleColors, ranges, trailing, found]) => {
      const segments = segmentsOf(text, textRuns, styleColors, ranges, trailing, found);

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

test("each of the text's characters is found as the find bar found it: the current match, a match, or neither", () => {
  fc.assert(
    fc.property(segmented, ([text, textRuns, styleColors, ranges, trailing, found]) => {
      const segments = segmentsOf(text, textRuns, styleColors, ranges, trailing, found);

      expect(
        segments.flatMap(({ start, text: piece, found: foundPiece }) =>
          Array.from({ length: piece.length }, (_, index) => [start + index, foundPiece]),
        ),
      ).toStrictEqual(Array.from({ length: text.length }, (_, at) => [at, foundAt(found, at)]));
    }),
  );
});

test("no segment is empty, and none has the colour of the one before it, its mark and what the find bar found it to be", () => {
  fc.assert(
    fc.property(segmented, ([text, textRuns, styleColors, ranges, trailing, found]) => {
      const segments: Segment[] = segmentsOf(text, textRuns, styleColors, ranges, trailing, found);

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
