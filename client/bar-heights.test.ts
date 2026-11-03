import * as fc from "fast-check";
import { expect, test } from "vitest";

import { measured, tallest } from "./bar-heights";

// Bars measured one after another, by their files' paths, some more than once.
const measures = fc.array(fc.tuple(fc.constantFrom("a", "b", "c", "d"), fc.nat()));

function measuredAll(all: readonly (readonly [string, number])[]): ReadonlyMap<string, number> {
  let heights: ReadonlyMap<string, number> = new Map();

  for (const [path, height] of all) {
    heights = measured(heights, path, height);
  }

  return heights;
}

test("keeps the height each file's bar was measured at last", () => {
  fc.assert(
    fc.property(measures, (all) => {
      const heights = measuredAll(all);

      for (const path of ["a", "b", "c", "d"]) {
        expect(heights.get(path)).toBe(all.findLast(([other]) => other === path)?.[1]);
      }
    }),
  );
});

test("keeps the same heights when a bar is measured at the height it has", () => {
  const heights = measured(new Map(), "a", 20);

  expect(measured(heights, "a", 20)).toBe(heights);
  expect(measured(heights, "a", 21)).not.toBe(heights);
});

test("makes the bars of the files listed as tall as the tallest of them, ignoring others'", () => {
  fc.assert(
    fc.property(measures, fc.subarray(["a", "b", "c", "d"]), (all, paths) => {
      const heights = measuredAll(all);
      const listed = [...heights].filter(([path]) => paths.includes(path));
      const height = tallest(heights, paths);

      expect([0, ...new Map(listed).values()]).toContain(height);

      for (const [, other] of listed) {
        expect(height).toBeGreaterThanOrEqual(other);
      }
    }),
  );
});
