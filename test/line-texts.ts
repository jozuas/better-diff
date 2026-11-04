import * as fc from "fast-check";

// Pieces of text that make words of every kind when put together: letters, a combining mark,
// digits of two scripts, an underscore, whitespace of several kinds, among them a newline and `\r`,
// punctuation and an emoji.
const fragment = fc.constantFrom(
  "a",
  "b",
  "foo",
  "é",
  "\u0301",
  "1",
  "٣",
  "_",
  " ",
  "  ",
  "\t",
  "\r",
  "\n",
  "\u00A0",
  "(",
  ")",
  ";",
  "😀",
);

// A line's text, made of those pieces, or of any characters.
export const lineText = fc.oneof(
  fc.array(fragment, { maxLength: 8 }).map((fragments) => fragments.join("")),
  fc.string({ unit: "binary", maxLength: 8 }),
);

// Lines with text no other line has, `name`'s, so that a version they're in has only one alignment
// with another.
export function uniqueLines(
  name: string,
  { minLength = 0, maxLength = 20 }: { minLength?: number; maxLength?: number } = {},
): fc.Arbitrary<string[]> {
  return fc
    .array(lineText, { minLength, maxLength })
    .map((lines) => lines.map((text, index) => `${name} ${index}: ${text}`));
}

// The removed or added lines of a run of changes.
export const runLines = fc.array(lineText, { maxLength: 4 });

// A word of letters, digits and underscores, of its own alphabet so that it's in no other.
export function word(alphabet: readonly string[]): fc.Arbitrary<string> {
  return fc.string({ unit: fc.constantFrom(...alphabet), minLength: 1, maxLength: 3 });
}
