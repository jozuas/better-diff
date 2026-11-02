import { expect, test } from "vitest";

import { hunkRevealed, lookOf } from "./reveal";

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
