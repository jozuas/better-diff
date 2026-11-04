import * as fc from "fast-check";
import { expect, test } from "vitest";

import { runLines, lineText as text, word } from "../test/line-texts";
import { rangesAt, unchangedText } from "../test/text-ranges";
import { changedTextOf } from "./changed-text";
import type { TextRange } from "./changed-text";
import { changedWordsOf } from "./changed-words";
import { numberLines } from "./lines";
import type { NumberedLine } from "./lines";

// A hunk's line, of the kind.
function hunkLine(kind: NumberedLine["kind"], line: string) {
  return { kind, text: line, newline: true };
}

// The changed text of each of a hunk's lines, by its index.
function changedWordsOfLines(lines: ReturnType<typeof hunkLine>[]): (readonly TextRange[])[] {
  return changedWordsOf(numberLines({ oldStart: 1, newStart: 1, lines }));
}

// A run of changes' removed lines and added ones.
interface Run {
  removed: string[];
  added: string[];
}

const run = fc.record({ removed: runLines, added: runLines });

// A run's lines in a hunk: its removed ones, then its added ones, as git gives them.
function linesOfRun({ removed, added }: Run): ReturnType<typeof hunkLine>[] {
  return [
    ...removed.map((line) => hunkLine("removed", line)),
    ...added.map((line) => hunkLine("added", line)),
  ];
}

test("a hunk's runs of changes change as each does in a hunk of its own, and its unchanged lines have no changed text", () => {
  // Runs, any of them empty, the first at the hunk's start and each other after an unchanged line,
  // so a hunk can start or end with a change or an unchanged line.
  const runs = fc.tuple(run, fc.array(fc.record({ context: text, run }), { maxLength: 4 }));

  fc.assert(
    fc.property(runs, ([first, rest]) => {
      expect(
        changedWordsOfLines([
          ...linesOfRun(first),
          ...rest.flatMap((next) => [hunkLine("context", next.context), ...linesOfRun(next.run)]),
        ]),
      ).toStrictEqual([
        ...changedWordsOfLines(linesOfRun(first)),
        ...rest.flatMap((next) => [[], ...changedWordsOfLines(linesOfRun(next.run))]),
      ]);
    }),
  );
});

// The lines' changed text, the run's instead for each that has some.
function asTheRunHas(
  changed: readonly (readonly TextRange[])[],
  ofRun: readonly (readonly TextRange[])[],
): (readonly TextRange[])[] {
  return changed.map((ranges, index) => (ranges.length === 0 ? [] : rangesAt(ofRun, index)));
}

test("each of a run's lines has the changed text its run has, or none", () => {
  fc.assert(
    fc.property(run, (lines) => {
      const changes = changedTextOf(lines.removed, lines.added);
      const ofRun = [...changes.removed, ...changes.added];
      const changed = changedWordsOfLines(linesOfRun(lines));

      expect(changed).toStrictEqual(asTheRunHas(changed, ofRun));
    }),
  );
});

// The lines that have changed text yet keep nothing but whitespace.
function keepingOnlyWhitespace(
  texts: readonly string[],
  changed: readonly (readonly TextRange[])[],
): string[] {
  return texts.filter(
    (line, index) =>
      rangesAt(changed, index).length > 0 &&
      !/\S/u.test(unchangedText([line], [rangesAt(changed, index)])),
  );
}

test("a line with changed text keeps more than whitespace", () => {
  fc.assert(
    fc.property(run, (lines) => {
      const texts = [...lines.removed, ...lines.added];

      expect(keepingOnlyWhitespace(texts, changedWordsOfLines(linesOfRun(lines)))).toStrictEqual(
        [],
      );
    }),
  );
});

test("a line with a word replaced by one it didn't have, after words or signs it keeps, has that word changed", () => {
  const ours = word(["a", "b", "é", "1", "_"]);

  fc.assert(
    fc.property(
      fc.array(fc.oneof(ours, fc.constantFrom("(", ";", "😀")), { minLength: 1, maxLength: 3 }),
      ours,
      word(["x", "y", "ß"]),
      fc.array(ours, { maxLength: 3 }),
      (before, old, replacement, after) => {
        const start = [...before, ""].join(" ").length;

        expect(
          changedWordsOfLines([
            hunkLine("removed", [...before, old, ...after].join(" ")),
            hunkLine("added", [...before, replacement, ...after].join(" ")),
          ]),
        ).toStrictEqual([
          [{ start, end: start + old.length }],
          [{ start, end: start + replacement.length }],
        ]);
      },
    ),
  );
});

test("a line rewritten among lines with changed words has none, nor has a line added among them", () => {
  expect(
    changedWordsOfLines([
      hunkLine("context", "a"),
      hunkLine("removed", "  const a = 42;"),
      hunkLine("removed", "  foo bar"),
      hunkLine("added", '  const a = "b";'),
      hunkLine("added", "  baz qux"),
      hunkLine("added", "  return a;"),
      hunkLine("context", "  foo bar"),
    ]),
  ).toStrictEqual([[], [{ start: 12, end: 14 }], [], [{ start: 12, end: 15 }], [], [], []]);
});
