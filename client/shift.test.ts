import { expect, test } from "vitest";

import { withShift } from "./shift";

test("a press is shifted when its event says Shift was held, and not when it says it wasn't or says nothing of it", () => {
  expect(withShift({ nativeEvent: { shiftKey: true } })).toBe(true);
  expect(withShift({ nativeEvent: { shiftKey: false } })).toBe(false);
  expect(withShift({ nativeEvent: {} })).toBe(false);
});
