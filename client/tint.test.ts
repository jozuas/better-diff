import { expect, test } from "vitest";

import { tintOf } from "./tint";

test("a pressed button is tinted as pressed, whether or not the pointer is over it, as when it's pressed from the keyboard", () => {
  expect(tintOf(true, true)).toBe("pressed");
  expect(tintOf(false, true)).toBe("pressed");
});

test("a button the pointer is over, unpressed, is tinted as hovered, and one it isn't over isn't tinted", () => {
  expect(tintOf(true, false)).toBe("hovered");
  expect(tintOf(false, false)).toBe("none");
});
