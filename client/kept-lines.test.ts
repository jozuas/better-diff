import * as fc from "fast-check";
import { expect, test } from "vitest";

import { lineText, uniqueLines } from "../test/line-texts";
import { keptLine } from "./kept-lines";

// A version of a view's lines and a later one, where each line was kept, removed or replaced by
// others, with others added between them: the index of one the later version keeps, and where it
// is in it.
const editedAround = fc
  .array(
    fc.record({
      text: lineText,
      kept: fc.oneof({ weight: 3, arbitrary: fc.constant(true) }, fc.constant(false)),
      added: fc.oneof(
        { weight: 3, arbitrary: fc.constant<string[]>([]) },
        uniqueLines("added", { maxLength: 3 }),
      ),
    }),
    { minLength: 1, maxLength: 40 },
  )
  .chain((lines) =>
    fc.nat({ max: lines.length - 1 }).map((anchor) => {
      const before = lines.map(({ text }, index) => `${index}: ${text}`);

      const after = lines.flatMap(({ kept, added }, index) => [
        ...added.map((text) => `${index} ${text}`),
        ...(kept || index === anchor ? [before[index] ?? ""] : []),
      ]);

      return { before, after, anchor, now: after.indexOf(before[anchor] ?? "") };
    }),
  );

test("a line both versions keep is found where the later one has it, whatever changed above and below it", () => {
  fc.assert(
    fc.property(editedAround, ({ before, after, anchor, now }) => {
      expect(keptLine(before, after, anchor)).toBe(now);
    }),
  );
});

test("a line found in a version that's the same is where it was", () => {
  fc.assert(
    fc.property(
      fc
        .array(lineText, { minLength: 1 })
        .chain((lines) =>
          fc.record({ lines: fc.constant(lines), index: fc.nat({ max: lines.length - 1 }) }),
        ),
      ({ lines, index }) => {
        expect(keptLine(lines, [...lines], index)).toBe(index);
      },
    ),
  );
});

// A version whose lines between the same ones before and after them are replaced by others, or by
// none, and which of those replaced, counting round from the first.
const replaced = fc
  .record({
    start: uniqueLines("start"),
    removed: uniqueLines("removed").filter((lines) => lines.length > 0),
    added: uniqueLines("added"),
    end: uniqueLines("end"),
    which: fc.nat(),
  })
  .filter(({ start, added, end }) => start.length + added.length + end.length > 0);

test("a line a version no longer has is followed by the one that takes its place: as many lines into those that replaced it, or else the next one kept, or else the last", () => {
  fc.assert(
    fc.property(replaced, ({ start, removed, added, end, which }) => {
      const after = [...start, ...added, ...end];
      const index = which % removed.length;

      expect(keptLine([...start, ...removed, ...end], after, start.length + index)).toBe(
        Math.min(start.length + Math.min(index, added.length), after.length - 1),
      );
    }),
  );
});

test("a line of a version is followed in none to no line", () => {
  expect(keptLine(["a", "b"], [], 1)).toBe(-1);
});

// The most lines two versions have in common in the same order, from a table of the most each
// start of one has in common with each start of the other, a row for each start of the first.
function inCommon(before: readonly string[], after: readonly string[]): number {
  let above = after.map(() => 0);

  for (const line of before) {
    const row: number[] = [];

    for (const [column, other] of after.entries()) {
      row.push(
        line === other
          ? (above[column - 1] ?? 0) + 1
          : Math.max(above[column] ?? 0, row[column - 1] ?? 0),
      );
    }

    above = row;
  }

  return above.at(-1) ?? 0;
}

// Versions of few kinds of line, which repeat, so that they have many alignments.
const repeating = fc.array(fc.constantFrom("a", "b", "", " a", "\t}", "é\r"), { maxLength: 30 });

test("as many lines are followed to lines with their text as the versions have in common, in the same order", () => {
  fc.assert(
    fc.property(repeating, repeating, (before, after) => {
      fc.pre(after.length > 0);

      const followed = before.map((_, index) => keptLine(before, after, index));
      const texts = followed.map((index) => after[index]);

      expect(texts).not.toContain(undefined);
      expect(followed).toStrictEqual(followed.toSorted((first, second) => first - second));
      expect(texts.filter((text, line) => text === before[line]).length).toBeGreaterThanOrEqual(
        inCommon(before, after),
      );
    }),
  );
});

// The most lines removed and added between versions for a line of one to be found in the other.
const followedEdits = 1000;

// Versions with no line in common, as many lines apart as the lengths say.
function apart(removed: number, added: number): string[][] {
  return [
    Array.from({ length: removed }, (_, index) => `removed ${index}`),
    Array.from({ length: added }, (_, index) => `added ${index}`),
  ];
}

test("a line is followed between versions as many as 1,000 lines apart, and not between versions further apart", () => {
  const [before = [], after = []] = apart(followedEdits / 2, followedEdits / 2);
  const [further = [], later = []] = apart(followedEdits / 2 + 1, followedEdits / 2);

  expect(keptLine(before, after, 0)).toBe(0);
  expect(keptLine([...before, "kept"], [...after, "kept"], followedEdits / 2)).toBe(
    followedEdits / 2,
  );
  expect(keptLine(further, later, 0)).toBe(-1);
});
