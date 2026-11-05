import * as fc from "fast-check";
import { expect, test } from "vitest";

import { runLines, lineText, word } from "../test/line-texts";
import { rangesAt, unchangedText } from "../test/text-ranges";
import { changedTextOf } from "./changed-text";
import type { TextRange } from "./changed-text";
import { wordsOf } from "./words";

// A line's text, which never has a newline in it.
const text = lineText.filter((line) => !line.includes("\n"));

const lines = runLines.map((run) => run.filter((line) => !line.includes("\n")));

const maxDistance = fc.double({ min: 0, max: 1, noNaN: true });

// Where each of the line's words and other characters starts, and where the last ends.
function tokenStarts(line: string): number[] {
  const starts = [0];

  for (const piece of wordsOf(line)) {
    starts.push((starts.at(-1) ?? 0) + piece.length);
  }

  return starts;
}

test("each line's changed text is in ranges of whole words and other characters, in order, apart from each other", () => {
  fc.assert(
    fc.property(lines, lines, maxDistance, (removed, added, distance) => {
      const changes = changedTextOf(removed, added, distance);

      for (const [texts, ranges] of [
        [removed, changes.removed],
        [added, changes.added],
      ] as const) {
        expect(ranges).toHaveLength(texts.length);

        for (const [index, line] of texts.entries()) {
          const bounds = rangesAt(ranges, index).flatMap(({ start, end }) => [start, end]);

          expect(bounds).toStrictEqual([...new Set(bounds)].toSorted((one, other) => one - other));
          expect(bounds.filter((bound) => !tokenStarts(line).includes(bound))).toStrictEqual([]);
        }
      }
    }),
  );
});

test("a removed line and the added line it's paired with keep the same text", () => {
  fc.assert(
    fc.property(text, text, (removed, added) => {
      const changes = changedTextOf([removed], [added], 1);

      expect([...changes.partners]).toStrictEqual([[0, 0]]);
      expect(unchangedText([removed], changes.removed)).toBe(unchangedText([added], changes.added));
    }),
  );
});

test("lines the same as the ones they replace are paired with them, and keep all their text", () => {
  fc.assert(
    fc.property(lines, maxDistance, (same, distance) => {
      const nothing = same.map(() => []);

      expect(changedTextOf(same, same, distance)).toStrictEqual({
        removed: nothing,
        added: nothing,
        partners: new Map(same.map((_, index) => [index, index])),
      });
    }),
  );
});

test("a word replaced by one the line didn't have is the only change of a line paired with the one it replaces", () => {
  const others = fc.array(word(["a", "b", "é"]), { maxLength: 3 });

  fc.assert(
    fc.property(
      others,
      word(["1", "_", "c"]),
      word(["x", "y", "ß"]),
      others,
      (before, old, replacement, after) => {
        const start = [...before, ""].join(" ").length;

        expect(
          changedTextOf(
            [[...before, old, ...after].join(" ")],
            [[...before, replacement, ...after].join(" ")],
            1,
          ),
        ).toStrictEqual({
          removed: [[{ start, end: start + old.length }]],
          added: [[{ start, end: start + replacement.length }]],
          partners: new Map([[0, 0]]),
        });
      },
    ),
  );
});

// Lines of words of the alphabet, between spaces.
function linesOfWordsIn(alphabet: readonly string[]): fc.Arbitrary<string[]> {
  return fc.array(
    fc.array(word(alphabet), { maxLength: 4 }).map((words) => words.join(" ")),
    { maxLength: 4 },
  );
}

test("lines with nothing but whitespace in common with any line on the other side have no changed text", () => {
  fc.assert(
    fc.property(
      linesOfWordsIn(["a", "b", "é"]),
      linesOfWordsIn(["x", "y", "ß"]),
      fc.double({ min: 0, max: 0.99, noNaN: true }),
      (removed, added, distance) => {
        expect(changedTextOf(removed, added, distance)).toMatchObject({
          removed: removed.map(() => []),
          added: added.map(() => []),
        });
      },
    ),
  );
});

// A line's text and its changed text.
interface MarkedLine {
  text: string;
  ranges: TextRange[];
}

// A line, with ⟦ and ⟧ around each piece of its changed text.
function marked(line: string): MarkedLine {
  const ranges: TextRange[] = [];
  let unmarked = "";

  for (const [index, piece] of line.split(/[⟦⟧]/u).entries()) {
    if (index % 2 === 1) {
      ranges.push({ start: unmarked.length, end: unmarked.length + piece.length });
    }

    unmarked += piece;
  }

  return { text: unmarked, ranges };
}

// The changes found in the marked lines, and the changes marked in them.
function changesOf(
  removed: readonly string[],
  added: readonly string[],
  maxLineDistance: number,
): [ReturnType<typeof changedTextOf>, Omit<ReturnType<typeof changedTextOf>, "partners">] {
  const removedLines = removed.map(marked);
  const addedLines = added.map(marked);

  return [
    changedTextOf(
      removedLines.map((line) => line.text),
      addedLines.map((line) => line.text),
      maxLineDistance,
    ),
    {
      removed: removedLines.map(({ ranges }) => ranges),
      added: addedLines.map(({ ranges }) => ranges),
    },
  ];
}

test.each<[string[], string[], number]>([
  [["⟦aaa⟧"], ["⟦aba⟧"], 1],
  [["⟦aaa⟧ ccc"], ["⟦aba⟧ ccc"], 1],
  [["⟦áaa⟧"], ["⟦ááb⟧"], 1],
  [["d.⟦iteritems⟧()"], ["d.⟦items⟧()"], 1],
  [["á a a á a a á a a", "á á b á á ⟦b⟧ á á b"], ["á á b á á ⟦c⟧ á á b"], 0.66],
  [
    ["aaaa a aaa", "bbbb ⟦b⟧ bbb", "cccc ⟦c⟧ ccc"],
    ["bbbb ⟦!⟧ bbb", "dddd d ddd", "cccc ⟦!⟧ ccc"],
    0.66,
  ],
  [
    [
      "             let mut i = 0;",
      "             for ((_, c0), (_, c1)) in s0.zip(s1) {",
      "                 if c0 != c1 {",
      "                     break;",
      "                 } else {",
      "                     i += c0.len();",
      "                 }",
      "             }",
      "             i",
    ],
    [
      "             s0.zip(s1)",
      "                 .take_while(|((_, c0), (_, c1))| c0 == c1) // TODO: Don't consume one-past-the-end!",
      "                 .fold(0, |offset, ((_, c0), (_, _))| offset + c0.len())",
    ],
    0.5,
  ],
  [
    ["fn coalesce_edits<'a, EditOperation>("],
    ["fn coalesce_edits<'a, ⟦'b, ⟧EditOperation>("],
    0.66,
  ],
  [
    ['for _ in range(0, options["count"]):'],
    ['for _ in range(0, ⟦int(⟧options["count"])⟦)⟧:'],
    0.3,
  ],
  [["a a"], ["a ⟦b ⟧a"], 1],
  [["a a"], ["a ⟦b b ⟧a"], 1],
  [
    ["so it is safe to read ⟦the commit number⟧ from any one of them."],
    ["so it is safe to read ⟦build info⟧ from any one of them."],
    1,
  ],
  [
    ["                 self.table[index] ="],
    ["                 self.table[index] =⟦ candidates⟧"],
    1,
  ],
  [
    ['                     (xxxxxxxxx, "build⟦ info⟧"),'],
    ['                     (xxxxxxxxx, "build"),'],
    1,
  ],
  [["'⟦b⟧ '", "[element⟦,⟧]"], ["' ⟦b⟧'", "[element]⟦,⟧"], 1],
  [["⟦a b⟧ c ⟦d ⟧", "⟦p ⟧"], ["⟦x y⟧ c ⟦z ⟧", "⟦q r⟧"], 1],
  [['⟦printf "%s\\n"⟧ s y y | git add -p &&'], ["⟦test_write_lines⟧ s y y | git add -p &&"], 1],
  [["a a a a a a ⟦b b b⟧"], ["⟦c ⟧a a a a a a ⟦c c⟧"], 1],
  [["⟦    foo⟧(1)"], ["⟦bar    ⟧(1)"], 0.6],
  [["  value = 1"], ["⟦let⟧  value = 1"], 1],
  [["⟦y⟧  x"], ["  x"], 1],
  [["⟦ b⟧ ⟦a⟧"], ["⟦a ⟧ ⟦aba⟧"], 1],
  [["⟦.⟧  "], ["  ⟦.ca⟧"], 1],
  [["⟦a  ⟧ ⟦..c⟧"], ["⟦  b⟧ ⟦b⟧"], 1],
  [["  ⟦  ⟧"], ["  "], 0.6],
  [["⟦  ⟧"], ["⟦\t⟧"], 0.6],
])(
  "lines, delta's tests' among them, have the changed text delta shows for them: %j to %j, up to %d different",
  (removed, added, maxLineDistance) => {
    const [changes, expected] = changesOf(removed, added, maxLineDistance);

    expect(changes).toMatchObject(expected);
  },
);

test.each<[number, string, string]>([
  [0.5, "⟦aaa⟧ ccc", "⟦aba⟧ ccc"],
  [0.49, "aaa ccc", "aba ccc"],
])(
  "lines are paired if at most as much of their text as allowed changed, counting what they keep twice, as once in each: %d",
  (maxLineDistance, removed, added) => {
    const [changes, expected] = changesOf([removed], [added], maxLineDistance);

    expect(changes).toMatchObject(expected);
  },
);

// The changed text of lines that keep the text, and replace one word with another, as the lines
// are paired, when at most the distance different, or not.
function replacingAfter(
  kept: string,
  old: string,
  replacement: string,
  maxLineDistance: number,
): ReturnType<typeof changedTextOf> {
  return changedTextOf([`${kept} ${old}`], [`${kept} ${replacement}`], maxLineDistance);
}

test.each<[string, number]>([
  ["😀", 0.4],
  ["日", 0.4],
  ["あ", 0.4],
  ["ア", 0.4],
  ["한", 0.4],
  ["、", 0.4],
  ["！", 0.4],
  ["￥", 0.4],
])(
  "an emoji or a Chinese, Japanese or Korean character is twice as much text as another, as a terminal shows it twice as wide: %j kept, at most %d different",
  (kept, maxLineDistance) => {
    const start = kept.length + 1;

    expect(replacingAfter(kept, "a", "b", maxLineDistance)).toStrictEqual({
      removed: [[{ start, end: start + 1 }]],
      added: [[{ start, end: start + 1 }]],
      partners: new Map([[0, 0]]),
    });
  },
);

test.each<[string, string, string, number]>([
  ["é", "a", "b", 0.4],
  ["e\u0301", "a", "b", 0.4],
  ["\u{1F44D}\u{1F3FD}", "ab", "cd", 0.4],
  ["a\u200Db", "x", "y", 0.3],
])(
  "a mark, a joiner or a skin tone is no text, as a terminal shows it in the column of the character before it: %j kept, %j replaced by %j, at most %d different",
  (kept, old, replacement, maxLineDistance) => {
    expect(replacingAfter(kept, old, replacement, maxLineDistance)).toStrictEqual({
      removed: [[]],
      added: [[]],
      partners: new Map(),
    });
  },
);

// A line of the first word, then the other as many times more as make the count.
function wordsLine(first: string, other: string, count: number): string {
  return [first, ...Array.from({ length: count - 1 }, () => other)].join(" ");
}

test.each<[number, number, TextRange[], [number, number][]]>([
  [500, 500, [{ start: 0, end: 1 }], [[0, 0]]],
  [500, 501, [], []],
  [501, 500, [], []],
])(
  "a run's lines are paired while the tables aligning them have at most a million cells together: lines of %d and %d words",
  (removedCount, addedCount, ranges, partners) => {
    expect(
      changedTextOf([wordsLine("a", "a", removedCount)], [wordsLine("b", "a", addedCount)], 0.6),
    ).toStrictEqual({ removed: [ranges], added: [ranges], partners: new Map(partners) });
  },
);

test("a run's lines aren't paired once the tables aligning them would have more than a million cells together", () => {
  const line = wordsLine("a", "a", 400);
  const replacement = wordsLine("b", "a", 400);

  expect(changedTextOf([line], [replacement], 0.6).removed).toStrictEqual([[{ start: 0, end: 1 }]]);
  expect(changedTextOf([wordsLine("c", "c", 400), line], [replacement], 0.6)).toStrictEqual({
    removed: [[], []],
    added: [[]],
    partners: new Map(),
  });
});
