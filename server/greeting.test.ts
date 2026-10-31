import * as fc from "fast-check";
import { expect, test } from "vitest";

import { createGreeting } from "./greeting";

test("greets by name", () => {
  expect(createGreeting({ name: "Ada" })).toStrictEqual({ message: "Hello, Ada!" });
});

test("keeps the whole name in the message", () => {
  fc.assert(
    fc.property(fc.string({ unit: "binary" }), (name) => {
      expect(createGreeting({ name }).message.slice("Hello, ".length, -1)).toBe(name);
    }),
  );
});
