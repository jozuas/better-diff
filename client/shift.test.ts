import { expect, test } from "vitest";

import { shiftStep, withShift } from "./shift";

const shift = { shiftKey: true, altKey: false, ctrlKey: false, metaKey: false };

test("shift+↓ moves the file a selection reaches on to the next file, and shift+↑ back to the one before", () => {
  expect(shiftStep({ ...shift, key: "ArrowDown" })).toBe(1);
  expect(shiftStep({ ...shift, key: "ArrowUp" })).toBe(-1);
});

test("another key with Shift moves nothing", () => {
  expect(shiftStep({ ...shift, key: "ArrowLeft" })).toBeUndefined();
  expect(shiftStep({ ...shift, key: "Enter" })).toBeUndefined();
});

test.each([{ shiftKey: false }, { altKey: true }, { ctrlKey: true }, { metaKey: true }])(
  "↓ and ↑ move nothing without Shift, or with another modifier: %o",
  (modifiers) => {
    expect(shiftStep({ ...shift, ...modifiers, key: "ArrowDown" })).toBeUndefined();
    expect(shiftStep({ ...shift, ...modifiers, key: "ArrowUp" })).toBeUndefined();
  },
);

test("a press is shifted when its event says Shift was held, and not when it says it wasn't or says nothing of it", () => {
  expect(withShift({ nativeEvent: { shiftKey: true } })).toBe(true);
  expect(withShift({ nativeEvent: { shiftKey: false } })).toBe(false);
  expect(withShift({ nativeEvent: {} })).toBe(false);
});
