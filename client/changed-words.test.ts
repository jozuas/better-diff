import * as fc from "fast-check";
import { expect, test } from "vitest";

import { runLines, lineText as text } from "../test/line-texts";
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

test.each<[string, string, TextRange[]]>([
  ["x ab", "x c", [{ start: 2, end: 4 }]],
  ["x abc", "x d", []],
])(
  "a removed line and an added one are paired if at most 60% of their text changed, counting what they keep twice: %j to %j",
  (removed, added, removedRanges) => {
    expect(
      changedWordsOfLines([hunkLine("removed", removed), hunkLine("added", added)]),
    ).toStrictEqual([removedRanges, removedRanges.map(({ start }) => ({ start, end: start + 1 }))]);
  },
);

test("a line rewritten among lines with changed words has none, nor has a line added among them", () => {
  expect(
    changedWordsOfLines([
      hunkLine("context", "a"),
      hunkLine("removed", "  const a = 42;"),
      hunkLine("removed", "  foo bar"),
      hunkLine("added", "  const a = 43;"),
      hunkLine("added", "  baz qux"),
      hunkLine("added", "  return a;"),
      hunkLine("context", "  foo bar"),
    ]),
  ).toStrictEqual([[], [{ start: 12, end: 14 }], [], [{ start: 12, end: 14 }], [], [], []]);
});
