import { expect, test } from "vitest";

import type { NumberedLine } from "./lines";
import { commentedRuns, openedAbove, runShown, shownLines } from "./runs";
import type { ShownRuns } from "./runs";

// Three hunks, the runs of unchanged lines above each closed.
const closed: ShownRuns = {
  entire: false,
  runs: [
    { oldStart: 10, newStart: 10, open: false },
    { oldStart: 50, newStart: 50, open: false },
    { oldStart: 90, newStart: 90, open: false },
  ],
};

function lines(...texts: string[]): NumberedLine[] {
  return texts.map((text, at) => ({
    kind: "context",
    text,
    newline: true,
    runs: [],
    oldNumber: at + 1,
    newNumber: at + 1,
  }));
}

const unchanged = {
  before: lines("before", "the first"),
  after: [lines("after", "the first"), lines("after", "the second"), lines("after", "the last")],
};

// Whether a line's commented on: those that say one of the texts are.
function saying(...texts: string[]): (line: NumberedLine) => boolean {
  return ({ text }) => texts.includes(text);
}

test("the runs of unchanged lines commented on are those with a line commented on, the one before the first hunk first, and the one after the last last", () => {
  expect(commentedRuns(unchanged, saying())).toStrictEqual(new Set());
  expect(commentedRuns(unchanged, saying("the first"))).toStrictEqual(new Set([0, 1]));
  expect(commentedRuns(unchanged, saying("the second", "the last"))).toStrictEqual(new Set([2, 3]));
});

test("a run of unchanged lines commented on shows, though it isn't open, and the others as they are, the one after the last hunk too", () => {
  const commented = new Set([0, 3]);

  expect(shownLines(unchanged, closed, commented)).toStrictEqual({
    before: unchanged.before,
    after: [[], [], unchanged.after[2]],
  });
  expect(shownLines(unchanged, openedAbove(closed, 1), commented)).toStrictEqual({
    before: unchanged.before,
    after: [unchanged.after[0], [], unchanged.after[2]],
  });
  expect([0, 1, 2, 3].map((index) => runShown(closed, index, commented))).toStrictEqual([
    "kept",
    "hidden",
    "hidden",
    "kept",
  ]);
});
