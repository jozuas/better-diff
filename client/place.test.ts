import { expect, test } from "vitest";

import { topPlace } from "./place";

test("the top is under the last marker at or above it", () => {
  expect(
    topPlace([
      { id: "a", offset: -300 },
      { id: "b", offset: -20 },
      { id: "c", offset: 0 },
      { id: "d", offset: 40 },
    ]),
  ).toStrictEqual({ id: "c", offset: 0 });
  expect(
    topPlace([
      { id: "a", offset: -300 },
      { id: "b", offset: -20 },
      { id: "c", offset: 1 },
    ]),
  ).toStrictEqual({ id: "b", offset: -20 });
});

test("the top is under the first marker when none is at or above it, and under none without any", () => {
  expect(
    topPlace([
      { id: "a", offset: 28 },
      { id: "b", offset: 300 },
    ]),
  ).toStrictEqual({ id: "a", offset: 28 });
  expect(topPlace([])).toBeUndefined();
});
