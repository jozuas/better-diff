import * as fc from "fast-check";
import { expect, test } from "vitest";

import { menuPosition } from "./menu";

const length = fc.integer({ min: 0, max: 2000 });

// A window, a menu that fits in it, and a point in it.
const opened = fc.record({ width: length, height: length }).chain((window) =>
  fc.record({
    window: fc.constant(window),
    menu: fc.record({
      width: fc.integer({ min: 0, max: window.width }),
      height: fc.integer({ min: 0, max: window.height }),
    }),
    point: fc.record({
      x: fc.integer({ min: 0, max: window.width }),
      y: fc.integer({ min: 0, max: window.height }),
    }),
  }),
);

test("keeps a menu that fits in the window inside it", () => {
  fc.assert(
    fc.property(opened, ({ window, menu, point }) => {
      const { left, top } = menuPosition(point, menu, window);

      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(left + menu.width).toBeLessThanOrEqual(window.width);
      expect(top + menu.height).toBeLessThanOrEqual(window.height);
    }),
  );
});

// A window, a point in it, and a menu that fits below the point and to its right.
const fitting = fc
  .record({ width: length, height: length })
  .chain((window) =>
    fc.record({
      window: fc.constant(window),
      point: fc.record({
        x: fc.integer({ min: 0, max: window.width }),
        y: fc.integer({ min: 0, max: window.height }),
      }),
    }),
  )
  .chain(({ window, point }) =>
    fc.record({
      window: fc.constant(window),
      point: fc.constant(point),
      menu: fc.record({
        width: fc.integer({ min: 0, max: window.width - point.x }),
        height: fc.integer({ min: 0, max: window.height - point.y }),
      }),
    }),
  );

test("opens a menu at the point, below it and to its right, where it fits there", () => {
  fc.assert(
    fc.property(fitting, ({ window, menu, point }) => {
      expect(menuPosition(point, menu, window)).toStrictEqual({ left: point.x, top: point.y });
    }),
  );
});

test("opens a menu with no room below and to the right of the point above it and to its left", () => {
  expect(
    menuPosition({ x: 300, y: 200 }, { width: 100, height: 50 }, { width: 350, height: 220 }),
  ).toStrictEqual({ left: 200, top: 150 });
});

test("opens a menu with room for it on neither side of the point at the window's edge", () => {
  expect(
    menuPosition({ x: 30, y: 20 }, { width: 100, height: 50 }, { width: 110, height: 60 }),
  ).toStrictEqual({ left: 0, top: 0 });
});

test("opens a menu that just fits below and to the right of the point there", () => {
  expect(
    menuPosition({ x: 10, y: 20 }, { width: 100, height: 50 }, { width: 110, height: 70 }),
  ).toStrictEqual({ left: 10, top: 20 });
});
