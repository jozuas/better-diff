import * as fc from "fast-check";
import { expect, test } from "vitest";

import { upToShow } from "./runs";

test("a run of unchanged lines shown above a hunk with some of its lines in sight leaves the view as it is", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 100 }),
      fc.integer({ min: 1, max: 1000 }),
      fc.integer({ min: 1, max: 1000 }),
      fc.integer({ min: 0, max: 1000 }),
      (ceiling, below, tall, middle) => {
        const bar = ceiling + below;

        expect(upToShow({ first: bar - tall, bar, ceiling, middle })).toBe(0);
        expect(upToShow({ first: undefined, bar, ceiling, middle })).toBe(0);
      },
    ),
  );
});

test("a run of unchanged lines shown above a hunk out of sight scrolls into it, all of it under the bars at the view's top, or as much as fits with the hunk's bar no lower than the view's middle", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 100 }),
      fc.integer({ min: 0, max: 1000 }),
      fc.integer({ min: 1, max: 2000 }),
      fc.integer({ min: 0, max: 1000 }),
      (ceiling, above, tall, lower) => {
        const bar = ceiling - above;
        const first = bar - tall;
        const middle = ceiling + lower;
        const up = upToShow({ first, bar, ceiling, middle });

        expect(first + up).toBeLessThanOrEqual(ceiling);
        expect(bar + up).toBeLessThanOrEqual(middle);
        expect(Math.min(ceiling - first - up, middle - bar - up)).toBe(0);
      },
    ),
  );
});

test("a run of unchanged lines shown above a hunk out of sight, whose first line isn't rendered, scrolls into sight with the hunk's bar at the view's middle", () => {
  expect(upToShow({ first: undefined, bar: 30, ceiling: 40, middle: 300 })).toBe(270);
  expect(upToShow({ first: -500, bar: 30, ceiling: 40, middle: 300 })).toBe(270);
  expect(upToShow({ first: -100, bar: 40, ceiling: 40, middle: 300 })).toBe(140);
});

test("a view no taller than the bars at its top scrolls no way for a run of unchanged lines out of sight", () => {
  expect(upToShow({ first: -100, bar: 40, ceiling: 40, middle: 20 })).toBe(0);
});
