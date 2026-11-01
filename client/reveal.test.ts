import { expect, test } from "vitest";

import { lookOf } from "./reveal";

test("the open file's row looks open, whether or not it's revealed, and another revealed or plain", () => {
  expect(lookOf(true, false)).toBe("open");
  expect(lookOf(true, true)).toBe("open");
  expect(lookOf(false, true)).toBe("revealed");
  expect(lookOf(false, false)).toBe("plain");
});
