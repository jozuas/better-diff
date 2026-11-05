import * as fc from "fast-check";

import { numberLines } from "../client/lines";
import type { NumberedLine } from "../client/lines";

type Kind = NumberedLine["kind"];

// A hunk's lines, numbered, of every kind in any order. Each has text no other line has.
export const hunkLines = fc
  .array(
    fc.record({
      kind: fc.constantFrom<Kind>("context", "removed", "added"),
      text: fc.string({ unit: "binary" }),
      newline: fc.boolean(),
      runs: fc.constant<NumberedLine["runs"]>([]),
    }),
    { maxLength: 20 },
  )
  .map((lines) =>
    numberLines({
      oldStart: 1,
      newStart: 1,
      lines: lines.map((line, index) => ({ ...line, text: `${index} ${line.text}` })),
    }),
  );
