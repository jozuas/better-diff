import * as fc from "fast-check";
import { expect, test } from "vitest";

import { runLines, lineText as text, word } from "../test/line-texts";
import { keptPositions, rangesAt, unchangedText } from "../test/text-ranges";
import { changedTextOf } from "./changed-text";
import type { TextRange } from "./changed-text";
import { wordsOf } from "./words";

const words = fc.array(word(["a", "b", "é", "1", "_"]), { minLength: 1, maxLength: 6 });

// Where each of the line's words starts, and where the last ends.
function wordStarts(line: string): number[] {
  const starts = [0];

  for (const piece of wordsOf(line)) {
    starts.push((starts.at(-1) ?? 0) + piece.length);
  }

  return starts;
}

test("each line's changed text is in ranges of whole words, in order, apart from each other", () => {
  fc.assert(
    fc.property(runLines, runLines, (removed, added) => {
      const changes = changedTextOf(removed, added);

      for (const [texts, ranges] of [
        [removed, changes.removed],
        [added, changes.added],
      ] as const) {
        expect(ranges).toHaveLength(texts.length);

        for (const [index, line] of texts.entries()) {
          const bounds = rangesAt(ranges, index).flatMap(({ start, end }) => [start, end]);

          expect(bounds).toStrictEqual([...new Set(bounds)].toSorted((one, other) => one - other));
          expect(bounds.filter((bound) => !wordStarts(line).includes(bound))).toStrictEqual([]);
        }
      }
    }),
  );
});

test("the text the removed lines keep is the text the added lines keep", () => {
  fc.assert(
    fc.property(runLines, runLines, (removed, added) => {
      const changes = changedTextOf(removed, added);

      expect(unchangedText(removed, changes.removed)).toBe(unchangedText(added, changes.added));
    }),
  );
});

test("lines the same as the ones they replace keep all their text", () => {
  fc.assert(
    fc.property(runLines, (same) => {
      const nothing = same.map(() => []);

      expect(changedTextOf(same, same)).toStrictEqual({ removed: nothing, added: nothing });
    }),
  );
});

test("a word replaced by one the line didn't have is the line's only change", () => {
  const others = fc.array(word(["a", "b", "é", "1", "_"]), { maxLength: 3 });

  fc.assert(
    fc.property(
      others,
      word(["a", "b", "é", "1", "_"]),
      word(["x", "y", "ß"]),
      others,
      (before, old, replacement, after) => {
        const start = [...before, ""].join(" ").length;

        expect(
          changedTextOf(
            [[...before, old, ...after].join(" ")],
            [[...before, replacement, ...after].join(" ")],
          ),
        ).toStrictEqual({
          removed: [[{ start, end: start + old.length }]],
          added: [[{ start, end: start + replacement.length }]],
        });
      },
    ),
  );
});

test("words added to a line are its only changes, and the line they're added to keeps all its text", () => {
  fc.assert(
    fc.property(
      words,
      fc.array(fc.tuple(fc.nat(), word(["a", "b", "x"])), { minLength: 1, maxLength: 3 }),
      (old, insertions) => {
        const added = [...old];

        for (const [at, inserted] of insertions) {
          added.splice(at % (added.length + 1), 0, inserted);
        }

        const changes = changedTextOf([old.join(" ")], [added.join(" ")]);

        expect(changes.removed).toStrictEqual([[]]);
        expect(unchangedText([added.join(" ")], changes.added)).toBe(old.join(" "));
      },
    ),
  );
});

// How much text is changed between the kept characters at the positions `before` and `after` in
// each line, the start or end of the line where there's none.
function changedBetween(
  positions: readonly (readonly number[])[],
  lengths: readonly number[],
  before: number,
  after: number,
): number {
  return Math.min(
    ...positions.map(
      (kept, side) => (kept[after] ?? lengths[side] ?? 0) - (kept[before] ?? -1) - 1,
    ),
  );
}

// The lengths of the stretches of text a line keeps, and the line it replaces, that are no longer
// than the text both removed and added on each side of them.
function coincidences(removed: string, added: string): number[] {
  const changes = changedTextOf([removed], [added]);
  const lengths = [removed.length, added.length];
  const found: number[] = [];
  let first = 0;

  const positions = [
    keptPositions(removed, rangesAt(changes.removed, 0)),
    keptPositions(added, rangesAt(changes.added, 0)),
  ];

  for (let at = 1; at <= (positions[0]?.length ?? 0); at += 1) {
    if (positions.some((side) => (side[at] ?? Infinity) !== (side[at - 1] ?? 0) + 1)) {
      const length = at - first;

      if (
        length <= changedBetween(positions, lengths, first - 1, first) &&
        length <= changedBetween(positions, lengths, at - 1, at)
      ) {
        found.push(length);
      }

      first = at;
    }
  }

  return found;
}

test("each stretch a line keeps is longer than the text both removed and added on one side of it", () => {
  fc.assert(
    fc.property(text, text, (removed, added) => {
      expect(coincidences(removed, added)).toStrictEqual([]);
    }),
  );
});

test.each([
  ["foo bar", "baz qux"],
  ["foo = bar", "baz = qux"],
  ["aaa b ccc = ddd", "eee b fff = ggg"],
  ["aaa b,.ddd", "eee b;.fff"],
])(
  "an unchanged stretch of a line with at least as much text both removed and added on each side of it counts as changed: %j to %j",
  (removed, added) => {
    expect(changedTextOf([removed], [added])).toStrictEqual({
      removed: [[{ start: 0, end: removed.length }]],
      added: [[{ start: 0, end: added.length }]],
    });
  },
);

// A range of changed text.
function range(start: number, end: number): TextRange {
  return { start, end };
}

test.each([
  ["x yyyy", "x zzzz", [range(2, 6)], [range(2, 6)]],
  ["if (a) {", "while (b) {", [range(0, 2), range(4, 5)], [range(0, 5), range(7, 8)]],
  ["foo(x)", "bar(x)", [range(0, 3)], [range(0, 3)]],
  ["aaa b ccc", "ddd b e", [range(0, 3), range(6, 9)], [range(0, 3), range(6, 7)]],
  ["a b xx c yyy", "a b z c www", [range(4, 6), range(9, 12)], [range(4, 5), range(8, 11)]],
  ["a.long.b", "c,long,d", [range(0, 2), range(6, 8)], [range(0, 2), range(6, 8)]],
])(
  "an unchanged stretch of a line longer than the text both removed and added on one side of it stays unchanged: %j to %j",
  (removed, added, removedRanges, addedRanges) => {
    expect(changedTextOf([removed], [added])).toStrictEqual({
      removed: [removedRanges],
      added: [addedRanges],
    });
  },
);

test.each([
  [
    ["xxxx.a", "b.yyyy"],
    ["zzzz.a", "b.wwww"],
    [[range(0, 4)], [range(2, 6)]],
  ],
  [
    ["xxxx.", "yyyy"],
    ["zzzz.", "wwww"],
    [[range(0, 4)], [range(0, 4)]],
  ],
  [
    ["  initializeConfiguration();", "  loadUserPreferences();"],
    ["  setupConfiguration();", "  readUserPreferences();"],
    [[range(2, 25)], [range(2, 21)]],
    [[range(2, 20)], [range(2, 21)]],
  ],
  [
    ["  x = computeSomething(a);", "", "  y = computeOtherThing(b);"],
    ["  x = calculateSomething(a);", "", "  y = calculateOtherThing(b);"],
    [[range(6, 22)], [], [range(6, 23)]],
    [[range(6, 24)], [], [range(6, 25)]],
  ],
])(
  "an unchanged stretch with a break in it stays unchanged, however much changed on each side of it: %j to %j",
  (removed, added, removedRanges, addedRanges = removedRanges) => {
    expect(changedTextOf(removed, added)).toStrictEqual({
      removed: removedRanges,
      added: addedRanges,
    });
  },
);

// A word of a letter of its own, as long as the length, then a sign of its own, by the index: words
// no other index has.
function wordsOfTheirOwn(index: number, length: number): string {
  return `${String.fromCodePoint(0x4e_00 + index).repeat(length)}${String.fromCodePoint(0x22_00 + index)}`;
}

// Removed lines, each replaced by an added line. Each is made of parts, of words no other part has,
// that the removed line, the added line or both have, so all a removed line can have in common with
// an added one, but for breaks, is what it has in common with the line replacing it, in one order.
const replacedLines = fc
  .array(
    fc.array(
      fc.tuple(fc.constantFrom("both", "removed", "added"), fc.integer({ min: 1, max: 4 })),
      { maxLength: 10 },
    ),
    { maxLength: 4 },
  )
  .map((lines) => {
    let index = 0;

    return lines.map((parts) => {
      const made = parts.map(([side, length]) => {
        index += 1;

        return { side, text: wordsOfTheirOwn(index, length) };
      });

      return {
        removed: made.flatMap(({ side, text: part }) => (side === "added" ? [] : [part])).join(""),
        added: made.flatMap(({ side, text: part }) => (side === "removed" ? [] : [part])).join(""),
      };
    });
  });

test("lines replaced by lines with words in common with no others change as each does on its own", () => {
  fc.assert(
    fc.property(replacedLines, (lines) => {
      const alone = lines.map((line) => changedTextOf([line.removed], [line.added]));

      expect(
        changedTextOf(
          lines.map((line) => line.removed),
          lines.map((line) => line.added),
        ),
      ).toStrictEqual({
        removed: alone.map((changes) => rangesAt(changes.removed, 0)),
        added: alone.map((changes) => rangesAt(changes.added, 0)),
      });
    }),
  );
});

test("a line split in two changes only the text between where it's split", () => {
  expect(changedTextOf(["foo(a, b)"], ["foo(a,", "  b)"])).toStrictEqual({
    removed: [[{ start: 6, end: 7 }]],
    added: [[], [{ start: 0, end: 2 }]],
  });
});

test("lines that take up to 1,000 words and breaks removed and added to compare are compared", () => {
  expect(changedTextOf([`x${" y".repeat(499)}`], ["x", "", ""])).toStrictEqual({
    removed: [[{ start: 1, end: 999 }]],
    added: [[], [], []],
  });
});

test("lines that take more than 1,000 words and breaks removed and added to compare keep all their text", () => {
  expect(changedTextOf([`x${" y".repeat(499)} `], ["x", "", ""])).toStrictEqual({
    removed: [[]],
    added: [[], [], []],
  });
});

const manyWords = ["x", " y".repeat(600), ""];

test("lines with none on the other side to compare with change all their text, however many words they have", () => {
  expect(changedTextOf(manyWords, [])).toStrictEqual({
    removed: [[{ start: 0, end: 1 }], [{ start: 0, end: 1200 }], []],
    added: [],
  });
  expect(changedTextOf([], manyWords)).toStrictEqual({
    removed: [],
    added: [[{ start: 0, end: 1 }], [{ start: 0, end: 1200 }], []],
  });
});
