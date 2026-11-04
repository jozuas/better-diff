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

// The removed or added lines of a run of changes.
export const runLines = fc.array(lineText, { maxLength: 4 });

// A word of letters, digits and underscores, of its own alphabet so that it's in no other.
export function word(alphabet: readonly string[]): fc.Arbitrary<string> {
  return fc.string({ unit: fc.constantFrom(...alphabet), minLength: 1, maxLength: 3 });
}
