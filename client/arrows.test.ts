import { expect, test } from "vitest";

import { hunkMove, rowMove } from "./arrows";

const plain = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };

test("in a file's row, ↓ moves focus to the next file, ↑ to the one before, and → into its diff", () => {
  expect(rowMove({ ...plain, key: "ArrowDown" })).toBe(1);
  expect(rowMove({ ...plain, key: "ArrowUp" })).toBe(-1);
  expect(rowMove({ ...plain, key: "ArrowRight" })).toBe("diff");
});

test("in a hunk's bar, ↓ moves focus to the next hunk, ↑ to the one before, and ← back to its file's row", () => {
  expect(hunkMove({ ...plain, key: "ArrowDown" })).toBe(1);
  expect(hunkMove({ ...plain, key: "ArrowUp" })).toBe(-1);
  expect(hunkMove({ ...plain, key: "ArrowLeft" })).toBe("row");
});

test("← in a file's row, → in a hunk's bar, and other keys move nothing", () => {
  expect(rowMove({ ...plain, key: "ArrowLeft" })).toBeUndefined();
  expect(hunkMove({ ...plain, key: "ArrowRight" })).toBeUndefined();
  expect(rowMove({ ...plain, key: "Enter" })).toBeUndefined();
  expect(hunkMove({ ...plain, key: "Enter" })).toBeUndefined();
});

test.each([{ shiftKey: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true }])(
  "arrows with a modifier move nothing: %o",
  (modifier) => {
    for (const key of ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"]) {
      expect(rowMove({ ...plain, ...modifier, key })).toBeUndefined();
      expect(hunkMove({ ...plain, ...modifier, key })).toBeUndefined();
    }
  },
);
