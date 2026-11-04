import * as fc from "fast-check";
import { expect, test } from "vitest";

import { lineText } from "../test/line-texts";
import { startsWithWord, wordsOf } from "./words";

type Kind = "word" | "other";

// What a piece of text is: a run of letters, marks, decimal digits, connectors and joiners, as Rust's
// \w matches, or something else.
function kindOf(piece: string): Kind {
  return /^[\p{Alphabetic}\p{M}\p{Nd}\p{Pc}\p{Join_Control}]+$/u.test(piece) ? "word" : "other";
}

// The words followed by a word.
function wordsFollowedByWords(kinds: readonly Kind[]): string[] {
  return kinds.filter((kind, index) => kind === "word" && kinds[index + 1] === "word");
}

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

// Where each of the text's tokens starts, and where the last ends.
function wordBounds(text: string): number[] {
  const bounds = [0];

  for (const piece of wordsOf(text)) {
    bounds.push((bounds.at(-1) ?? 0) + piece.length);
  }

  return bounds;
}

// The tokens that aren't words, yet have more than one of the text's characters as a reader sees
// them, its grapheme clusters.
function othersOfManyCharacters(text: string): string[] {
  const starts = new Set([...graphemes.segment(text)].map(({ index }) => index));
  const bounds = wordBounds(text);

  return wordsOf(text).filter(
    (piece, index) =>
      kindOf(piece) === "other" &&
      Array.from({ length: piece.length - 1 }, (_, at) => (bounds[index] ?? 0) + at + 1).some(
        (at) => starts.has(at),
      ),
  );
}

test("the words and other characters make up the text", () => {
  fc.assert(
    fc.property(lineText, (line) => {
      expect(wordsOf(line).join("")).toBe(line);
    }),
  );
});

test("each token is a word as long as it goes, or another character as a reader sees it, or part of one", () => {
  fc.assert(
    fc.property(lineText, (line) => {
      expect(wordsFollowedByWords(wordsOf(line).map(kindOf))).toStrictEqual([]);
      expect(othersOfManyCharacters(line)).toStrictEqual([]);
    }),
  );
});

test("a text starts with a word if its first token is one", () => {
  fc.assert(
    fc.property(lineText, (line) => {
      expect(startsWithWord(line)).toBe(wordsOf(line).slice(0, 1).map(kindOf).includes("word"));
    }),
  );
});

test.each([
  ["café_1 x٣", ["café_1", " ", "x٣"]],
  ["e\u0301 a\u200Db a‿b Ⅻ", ["e\u0301", " ", "a\u200Db", " ", "a‿b", " ", "Ⅻ"]],
  ["if (x²  >= 1)", ["if", " ", "(", "x", "²", " ", " ", ">", "=", " ", "1", ")"]],
])(
  "a word is a run of letters, marks, decimal digits, connectors such as underscores, and joiners, and any other character is a token of its own: %j",
  (text, tokens) => {
    expect(wordsOf(text)).toStrictEqual(tokens);
  },
);

test.each<[string, boolean]>([
  ["a b", true],
  ["é", true],
  ["\u0301a", true],
  ["1", true],
  ["_a", true],
  ["\u200Da", true],
  [" a", false],
  ["(a", false],
  ["²", false],
  ["", false],
])("%j starts with a word: %s", (text, starts) => {
  expect(startsWithWord(text)).toBe(starts);
});

// Emoji of every kind a word keeps whole: joined to others, with a variation selector, with a skin
// tone, flags of two regional indicators and of tags, and keycaps with and without a variation
// selector.
const emoji = [
  "\u{1F600}",
  "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}",
  "\u2764\uFE0F",
  "\u{1F44D}\u{1F3FD}",
  "\u{1F469}\u{1F3FD}\u200D\u{1F4BB}",
  "\u{1F3F3}\uFE0F\u200D\u{1F308}",
  "\u{1F441}\uFE0F\u200D\u{1F5E8}\uFE0F",
  "\u{1F9D1}\u{1F3FB}\u200D\u{1F91D}\u200D\u{1F9D1}\u{1F3FD}",
  "\u{1F1F1}\u{1F1F9}",
  "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
  "#\uFE0F\u20E3",
  "*\u20E3",
];

// Text of emoji among pieces of other kinds, as where each emoji starts and ends in it.
const withEmoji = fc
  .array(
    fc.oneof(
      fc.constantFrom(...emoji).map((text) => ({ text, isEmoji: true })),
      fc.constantFrom("a", "1", "_", " ", "(", "\u0301").map((text) => ({ text, isEmoji: false })),
    ),
    { maxLength: 8 },
  )
  .map((pieces) => {
    let end = 0;

    return {
      text: pieces.map(({ text }) => text).join(""),
      emoji: pieces.flatMap(({ text, isEmoji }) => {
        end += text.length;

        return isEmoji ? [{ start: end - text.length, end }] : [];
      }),
    };
  });

// Where words start or end inside the emoji.
function boundsInside(text: string, spans: readonly { start: number; end: number }[]): number[] {
  return wordBounds(text).filter((bound) =>
    spans.some(({ start, end }) => start < bound && bound < end),
  );
}

test("an emoji, with its modifiers and the emoji joined to it, is never split between words", () => {
  fc.assert(
    fc.property(withEmoji, ({ text, emoji: spans }) => {
      expect(boundsInside(text, spans)).toStrictEqual([]);
      expect(othersOfManyCharacters(text)).toStrictEqual([]);
    }),
  );
});
