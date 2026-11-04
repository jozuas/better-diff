import * as fc from "fast-check";
import { expect, test } from "vitest";

import { longestCommon } from "./longest-common";

// Lists of few kinds of items, so that they have some in common. Undefined among them, which an
// index past a list's end also reads as.
const list = fc.array(fc.option(fc.constantFrom("a", "b", "c"), { nil: undefined }), {
  maxLength: 12,
});

// How many items the lists have in common, at most, in the same order in both: by dynamic
// programming, from the longest common subsequence of each of their ends.
function longestLength(first: readonly unknown[], second: readonly unknown[]): number {
  const lengths = Array.from({ length: first.length + 1 }, () =>
    Array.from({ length: second.length + 1 }, () => 0),
  );

  for (let x = first.length - 1; x >= 0; x -= 1) {
    for (let y = second.length - 1; y >= 0; y -= 1) {
      const row = lengths[x] ?? [];
      const below = lengths[x + 1] ?? [];

      row[y] =
        first[x] === second[y] ? (below[y + 1] ?? 0) + 1 : Math.max(below[y] ?? 0, row[y + 1] ?? 0);
    }
  }

  return lengths[0]?.[0] ?? 0;
}

// The items the lists have in common, as many as there can be.
function commonOf(first: readonly unknown[], second: readonly unknown[]): [number, number][] {
  return longestCommon(first, second, first.length + second.length) ?? [];
}

// Whether each number is more than the one before it, and all are less than `length`.
function isIncreasing(numbers: readonly number[], length: number): boolean {
  return numbers.every((number, index) => number > (numbers[index - 1] ?? -1) && number < length);
}

test("the items found are in both lists, in the same order", () => {
  fc.assert(
    fc.property(list, list, (first, second) => {
      const pairs = commonOf(first, second);

      expect(
        isIncreasing(
          pairs.map(([x]) => x),
          first.length,
        ),
      ).toBe(true);
      expect(
        isIncreasing(
          pairs.map(([, y]) => y),
          second.length,
        ),
      ).toBe(true);
      expect(pairs.map(([x]) => first[x])).toStrictEqual(pairs.map(([, y]) => second[y]));
    }),
  );
});

test("as many items are found as the lists have in common, in the same order", () => {
  fc.assert(
    fc.property(list, list, (first, second) => {
      expect(longestCommon(first, second, first.length + second.length)).toHaveLength(
        longestLength(first, second),
      );
    }),
  );
});

test("nothing is found once making the second list from the first takes more than the limit's items removed and added", () => {
  fc.assert(
    fc.property(list, list, fc.nat({ max: 24 }), (first, second, limit) => {
      const edits = first.length + second.length - 2 * longestLength(first, second);

      expect(longestCommon(first, second, limit) === undefined).toBe(edits > limit);
    }),
  );
});
