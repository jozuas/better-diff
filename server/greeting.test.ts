import * as fc from "fast-check";
import { expect, test } from "vitest";

import { greetingRpc } from "../shared/greeting";
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

test("answers the same through the RPC's input and output validation", () => {
  fc.assert(
    fc.property(fc.string({ unit: "binary" }), (name) => {
      const validated = greetingRpc.output.parse(createGreeting(greetingRpc.input.parse({ name })));

      expect(validated).toStrictEqual(createGreeting({ name }));
    }),
  );
});
