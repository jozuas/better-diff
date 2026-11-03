import * as fc from "fast-check";
import { expect, test } from "vitest";

import { placeHeld, placeToShow, topPlace } from "./place";
import type { HunkPlace } from "./place";

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

// Few things a view shows, so that it often shows the same again.
const shown = fc.constantFrom("a", "b", "c");

const hunkPlace: fc.Arbitrary<HunkPlace> = fc.record({
  hunk: fc.nat(5),
  offset: fc.integer({ min: -500, max: 500 }),
  shown,
});

test("a hunk is shown in its held place again once the view shows something other than it did then", () => {
  fc.assert(
    fc.property(hunkPlace, shown, (place, now) => {
      fc.pre(place.shown !== now);

      expect(placeToShow(place, now)).toBe(place);
    }),
  );
});

test("a hunk isn't shown in its held place again while the view shows what it did then, nor without one", () => {
  fc.assert(
    fc.property(hunkPlace, shown, (place, now) => {
      expect(placeToShow({ ...place, shown: now }, now)).toBeUndefined();
      expect(placeToShow(undefined, now)).toBeUndefined();
    }),
  );
});

test("a hunk's place is held, as of what the view shows, while an action is under way", () => {
  fc.assert(
    fc.property(hunkPlace, shown, (place, now) => {
      expect(placeHeld(place, now, true)).toStrictEqual({ ...place, shown: now });
    }),
  );
});

test("a hunk's place is no longer held once no action is under way, and none is without one", () => {
  fc.assert(
    fc.property(hunkPlace, shown, fc.boolean(), (place, now, busy) => {
      expect(placeHeld(place, now, false)).toBeUndefined();
      expect(placeHeld(undefined, now, busy)).toBeUndefined();
    }),
  );
});
