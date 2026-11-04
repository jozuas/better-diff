import * as fc from "fast-check";
import { expect, test } from "vitest";

import { tintOf } from "./tints";

const byte = fc.integer({ min: 0, max: 255 });

// The red, green, blue and alpha of an rgba() colour.
function channelsOf(rgba: string | undefined): number[] {
  return (rgba ?? "")
    .replaceAll(/^rgba\(|\)$/gu, "")
    .split(", ")
    .map(Number);
}

test("a tint has its colour's red, green and blue, and its alpha times the opacity", () => {
  fc.assert(
    fc.property(
      byte,
      byte,
      byte,
      byte,
      fc.double({ min: 0, max: 1, noNaN: true }),
      (alpha, red, green, blue, opacity) => {
        const processed = alpha * 2 ** 24 + red * 2 ** 16 + green * 2 ** 8 + blue;
        const [r, g, b, a] = channelsOf(tintOf(processed, opacity));

        expect([r, g, b]).toStrictEqual([red, green, blue]);
        expect(a).toBeCloseTo((alpha / 255) * opacity);
      },
    ),
  );
});

test("a tint is a CSS rgba() colour", () => {
  expect(tintOf(0xff_dc_26_26, 0.3)).toBe("rgba(220, 38, 38, 0.3)");
});

test("a tint of a colour React Native can't read is none", () => {
  for (const processed of [undefined, null, Symbol("PlatformColor")]) {
    expect(tintOf(processed, 0.3)).toBeUndefined();
  }
});
