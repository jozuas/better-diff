import * as fc from "fast-check";
import { expect, test } from "vitest";

import { operationsOf } from "./alignment";
import type { Operation } from "./alignment";

const tokens = fc.array(fc.constantFrom("a", "b", "c", "", " ", "é"), { maxLength: 10 });

// The second list, as the operations make it from the first, keeping a token only where the second
// has it too, or undefined if they don't make it.
function replayed(
  first: readonly string[],
  second: readonly string[],
  operations: readonly Operation[],
): string[] | undefined {
  const made: string[] = [];
  let from = 0;

  for (const operation of operations) {
    if (operation === "add") {
      made.push(second[made.length] ?? "missing");
    } else if (operation === "keep" && first[from] === second[made.length]) {
      made.push(first[from] ?? "missing");
      from += 1;
    } else if (operation === "remove") {
      from += 1;
    } else {
      return undefined;
    }
  }

  return from === first.length ? made : undefined;
}

test("the operations turn the first list into the second, keeping only tokens both have", () => {
  fc.assert(
    fc.property(tokens, tokens, (first, second) => {
      expect(replayed(first, second, operationsOf(first, second))).toStrictEqual(second);
    }),
  );
});

// How many tokens the lists have in common, in order, at most.
function longestCommonLength(first: readonly string[], second: readonly string[]): number {
  let previous = Array.from({ length: second.length + 1 }, () => 0);

  for (const token of first) {
    const row = [0];

    for (const [index, other] of second.entries()) {
      row.push(
        token === other
          ? (previous[index] ?? 0) + 1
          : Math.max(previous[index + 1] ?? 0, row[index] ?? 0),
      );
    }

    previous = row;
  }

  return previous.at(-1) ?? 0;
}

test("the operations keep as many tokens as the lists have in common in order", () => {
  fc.assert(
    fc.property(tokens, tokens, (first, second) => {
      expect(operationsOf(first, second).filter((operation) => operation === "keep")).toHaveLength(
        longestCommonLength(first, second),
      );
    }),
  );
});

test.each<[string, string, Operation[]]>([
  ["kitten", "sitting", ["remove", "add", "keep", "keep", "keep", "remove", "add", "keep", "add"]],
  [
    "saturday",
    "sunday",
    ["keep", "remove", "remove", "keep", "remove", "add", "keep", "keep", "keep"],
  ],
  ["ab", "ba", ["remove", "keep", "add"]],
  ["AABB", "AB", ["keep", "remove", "remove", "keep"]],
  ["AB", "AABB", ["keep", "add", "add", "keep"]],
  ["AAABBB", "ACB", ["keep", "remove", "remove", "remove", "remove", "add", "keep"]],
])(
  "aligning %s with %s groups changes together as delta's alignment does",
  (first, second, operations) => {
    expect(operationsOf(first.split(""), second.split(""))).toStrictEqual(operations);
  },
);
