import * as fc from "fast-check";
import { expect, test } from "vitest";

import { hunksAndUnchanged, placesOf } from "../test/find";
import { lineText } from "../test/line-texts";
import {
  afterSection,
  beforeSection,
  finder,
  hunkSection,
  revealDistance,
  sectionsOf,
} from "./find";
import type { NumberedLine } from "./lines";
import { shownFileOf } from "./place";

// The characters a regular expression reads as more than themselves.
const specials = "$()*+.?[\\]^{|}".split("");

// Pieces of text each as long in lowercase as it is, in both cases, whitespace of several kinds,
// an emoji, and every special character.
const lowerPieces = ["a", "b", "é", "σ", "1", " ", "\t", "\r", "😀", ...specials];
const pieces = [...lowerPieces, "A", "B", "É", "Σ"];

function textOf(from: readonly string[], minLength: number, maxLength: number) {
  return fc
    .array(fc.constantFrom(...from), { minLength, maxLength })
    .map((parts) => parts.join(""));
}

const lines = textOf(pieces, 0, 12);

// The line's characters, whole, as text typed has them.
function charactersOf(line: string): string[] {
  return line.split(/(?:)/u);
}

// A line, and text to find in it: of the same pieces, or whole characters taken from the line.
function lineAndText(typed: fc.Arbitrary<string>): fc.Arbitrary<[string, string]> {
  return fc.oneof(
    fc.tuple(lines, typed),
    fc.tuple(lines, fc.nat(), fc.nat()).map(([line, from, length]): [string, string] => {
      const characters = charactersOf(line);
      const start = from % (characters.length + 1);
      const taken = characters.slice(start, start + 1 + (length % 3)).join("");

      return [line, taken === "" ? "a" : taken];
    }),
  );
}

// The line in lowercase, each character on its own.
function lowercase(line: string): string {
  return charactersOf(line)
    .map((character) => character.toLowerCase())
    .join("");
}

const capitalText = fc
  .tuple(textOf(pieces, 0, 1), fc.constantFrom("A", "B", "É", "Σ"), textOf(pieces, 0, 1))
  .map((parts) => parts.join(""));

test("with Match case on, the text is found where it is in the line, each place after the one before", () => {
  fc.assert(
    fc.property(
      fc.oneof(
        lineAndText(textOf(pieces, 1, 3)),
        fc.tuple(lineText, fc.string({ unit: "binary", minLength: 1, maxLength: 2 })),
      ),
      ([line, text]) => {
        expect(finder(text, true)(line)).toStrictEqual(placesOf(line, text));
      },
    ),
    { examples: [[["aaa", "aa"]], [["a😀a", "😀"]]] },
  );
});

test("text without a capital letter is found whatever the case, unless Match case is on", () => {
  fc.assert(
    fc.property(lineAndText(textOf(lowerPieces, 1, 3)), ([line, text]) => {
      fc.pre(text.toLowerCase() === text);
      expect(finder(text, false)(line)).toStrictEqual(placesOf(lowercase(line), text));
    }),
    { examples: [[["Ab aB", "ab"]], [["ΣσΣ", "σ"]]] },
  );
});

test("text with a capital letter is found only in its case", () => {
  fc.assert(
    fc.property(lineAndText(capitalText), ([line, text]) => {
      fc.pre(text.toLowerCase() !== text);
      expect(finder(text, false)(line)).toStrictEqual(placesOf(line, text));
    }),
    { examples: [[["a A a", "A"]]] },
  );
});

test("nothing typed is found nowhere", () => {
  fc.assert(
    fc.property(lines, fc.boolean(), (line, matchCase) => {
      expect(finder("", matchCase)(line)).toStrictEqual([]);
    }),
  );
});

test("characters a regular expression reads as more than themselves are found as they are", () => {
  expect(
    specials.map((special) => finder(`${special}a`, false)(`ba${special}a${special}A`)),
  ).toStrictEqual(
    specials.map(() => [
      { start: 2, end: 4 },
      { start: 4, end: 6 },
    ]),
  );
});

function textsOf(numbered: readonly NumberedLine[] | undefined): string[] {
  return (numbered ?? []).map(({ text }) => text);
}

test("a file's sections are the lines it shows, in order: the unchanged ones before its first hunk, then each hunk's and the unchanged ones after it", () => {
  fc.assert(
    fc.property(hunksAndUnchanged, ({ hunks, unchanged }) => {
      const sections = sectionsOf(hunks, unchanged);

      expect(sections.flat()).toStrictEqual(shownFileOf("a.txt", hunks, unchanged, "view:0").lines);
      expect(sections).toHaveLength(1 + 2 * hunks.length);
      expect(sections[beforeSection]).toStrictEqual(textsOf(unchanged.before));
      expect(hunks.map((_, index) => sections[hunkSection(index)])).toStrictEqual(
        hunks.map(({ lines: hunk }) => textsOf(hunk)),
      );
      expect(hunks.map((_, index) => sections[afterSection(index)])).toStrictEqual(
        hunks.map((_, index) => textsOf(unchanged.after[index])),
      );
    }),
  );
});

// A line's offset and height, and a view's height and the margin at its top, which leave room for
// the line.
const placed = fc.record({
  offset: fc.integer({ min: -1000, max: 1000 }),
  lineHeight: fc.integer({ min: 1, max: 50 }),
  viewHeight: fc.integer({ min: 150, max: 800 }),
  margin: fc.integer({ min: 0, max: 90 }),
});

interface Placed {
  offset: number;
  lineHeight: number;
  viewHeight: number;
  margin: number;
}

// Whether the line shows below the margin.
function showsBelow({ offset, lineHeight, viewHeight, margin }: Placed): boolean {
  return offset >= margin && offset + lineHeight <= viewHeight;
}

// How far below the margin the line's top is, and how far its bottom is above the view's, once it's
// scrolled as revealDistance says.
function roomAround({ offset, lineHeight, viewHeight, margin }: Placed): [number, number] {
  const top = offset - revealDistance(offset, lineHeight, viewHeight, margin);

  return [top - margin, viewHeight - top - lineHeight];
}

test("a line showing below the bars stuck at the view's top isn't scrolled", () => {
  fc.assert(
    fc.property(placed, (line) => {
      fc.pre(showsBelow(line));
      expect(revealDistance(line.offset, line.lineHeight, line.viewHeight, line.margin)).toBe(0);
    }),
    {
      examples: [
        [{ offset: 30, lineHeight: 20, viewHeight: 300, margin: 30 }],
        [{ offset: 280, lineHeight: 20, viewHeight: 300, margin: 30 }],
      ],
    },
  );
});

test("a line not showing below the bars stuck at the view's top is scrolled to the middle of the rest of the view", () => {
  fc.assert(
    fc.property(placed, (line) => {
      fc.pre(!showsBelow(line));

      const [above, below] = roomAround(line);

      expect(above).toBeGreaterThanOrEqual(0);
      expect(above).toBeCloseTo(below);
    }),
    {
      examples: [
        [{ offset: 29, lineHeight: 20, viewHeight: 300, margin: 30 }],
        [{ offset: 281, lineHeight: 20, viewHeight: 300, margin: 30 }],
      ],
    },
  );
});
