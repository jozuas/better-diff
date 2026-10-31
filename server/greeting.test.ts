import { expect, test } from "vitest";

import { createGreeting } from "./greeting";

test("greets by name", () => {
  expect(createGreeting({ name: "Ada" })).toStrictEqual({ message: "Hello, Ada!" });
});
