import * as fc from "fast-check";
import { expect, test } from "vitest";

import { hunkKeyed, hunkMark, hunkRevealed, lookOf, markedHunk, pressedBar } from "./reveal";

test("the open file's row looks open, whether or not it's revealed, and another revealed or plain", () => {
  expect(lookOf(true, false)).toBe("open");
  expect(lookOf(true, true)).toBe("open");
  expect(lookOf(false, true)).toBe("revealed");
  expect(lookOf(false, false)).toBe("plain");
});

test.each<[number | undefined, boolean, number | undefined, boolean]>([
  [1, false, undefined, true],
  [undefined, true, undefined, true],
  [undefined, false, 1, true],
  [undefined, false, undefined, false],
  [0, false, undefined, false],
  [undefined, false, 2, false],
])(
  "hunk 1's actions show with the pointer over hunk %j, focus in its bar %s and lines selected in hunk %j: %s",
  (pointed, focused, selected, revealed) => {
    expect(hunkRevealed(1, pointed, focused, selected)).toBe(revealed);
  },
);

// No lines selected, and no hunk pressed.
const unselected: undefined[] = [];
const unpressed: undefined[] = [];

test("a press of the pointer moves focus to the bar of the hunk whose lines it selected, or else of the hunk it was pressed in", () => {
  expect(pressedBar({ file: 1, hunk: 2 }, [0, 3])).toStrictEqual([1, 2]);
  expect(pressedBar({ file: 1, hunk: 2 }, unpressed[0])).toStrictEqual([1, 2]);
  expect(pressedBar(unselected[0], [0, 3])).toStrictEqual([0, 3]);
  expect(pressedBar(unselected[0], unpressed[0])).toBeUndefined();
});

test("a hunk's mark names the hunk again", () => {
  fc.assert(
    fc.property(fc.tuple(fc.nat(), fc.nat()), (hunk) => {
      expect(markedHunk(hunkMark(hunk))).toStrictEqual(hunk);
    }),
  );
});

test.each([undefined, "", "1", "1:", ":2", "1:2:3", "a:2", "1:-2", " 1:2"])(
  "%j marks no hunk",
  (mark) => {
    expect(markedHunk(mark)).toBeUndefined();
  },
);

test.each<[boolean, boolean, boolean]>([
  [true, false, true],
  [true, true, false],
  [false, false, false],
  [false, true, false],
])(
  "with focus on a hunk's bar itself: %s, and lines in it selected: %s, Enter and Backspace press its buttons: %s",
  (onBar, linesSelected, keyed) => {
    expect(hunkKeyed(onBar, linesSelected)).toBe(keyed);
  },
);
