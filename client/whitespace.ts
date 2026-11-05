import type { NumberedLine } from "./lines";

// What Magit counts as trailing whitespace.
const blanks = new Set([" ", "\t"]);

// Where the spaces and tabs an added line ends with start, which Magit marks by default as a
// whitespace error, and git does too: where the line ends for a line without any, or a removed or
// unchanged line. Read from the end, as a pattern anchored there tries each run of spaces in a line
// from each of its spaces.
export function trailingWhitespaceAt({ kind, text }: Pick<NumberedLine, "kind" | "text">): number {
  let start = text.length;

  if (kind === "added") {
    while (blanks.has(text.charAt(start - 1))) {
      start -= 1;
    }
  }

  return start;
}
