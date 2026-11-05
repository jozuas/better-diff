import * as fc from "fast-check";
import { expect, test } from "vitest";

import { lineText } from "../test/line-texts";
import { trailingWhitespaceAt } from "./whitespace";

// Whitespace and other characters that end lines, more often than lineText's mix of them does.
const ending = fc
  .array(fc.constantFrom(" ", "\t", "\r", "\u00A0", "\n", "x"), { maxLength: 4 })
  .map((pieces) => pieces.join(""));

const text = fc.tuple(lineText, ending).map(([start, end]) => start + end);

function isBlank(character: string): boolean {
  return character === " " || character === "\t";
}

test("an added line's trailing whitespace is the spaces and tabs it ends with, as Magit finds it", () => {
  fc.assert(
    fc.property(text, (line) => {
      const start = trailingWhitespaceAt({ kind: "added", text: line });

      expect(start).toBeLessThanOrEqual(line.length);
      expect(line.slice(start)).toMatch(/^[ \t]*$/u);
      expect(isBlank(line.charAt(start - 1))).toBe(false);
    }),
    { examples: [["a \t "], [" \t"], ["a \r"], ["a\u00A0"]] },
  );
});

test.each<[string, number]>([
  ["const a = 1;  ", 12],
  ["\tcall();\t", 8],
  ["  ", 0],
  ["", 0],
  ["kept", 4],
  ["a \r", 3],
])("an added line %j has trailing whitespace from %d", (line, start) => {
  expect(trailingWhitespaceAt({ kind: "added", text: line })).toBe(start);
});

test("a removed or unchanged line has no trailing whitespace", () => {
  fc.assert(
    fc.property(fc.constantFrom("removed" as const, "context" as const), text, (kind, line) => {
      expect(trailingWhitespaceAt({ kind, text: line })).toBe(line.length);
    }),
    {
      examples: [
        ["removed", "a  "],
        ["context", "\t"],
      ],
    },
  );
});
