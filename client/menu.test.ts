import * as fc from "fast-check";
import { expect, test } from "vitest";

import { itemLook, menuPosition, menuStep, panelPosition } from "./menu";

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

test("a menu's item is highlighted while the pointer is over it, unless it's disabled, which dims it", () => {
  expect(itemLook(false, false)).toBe("plain");
  expect(itemLook(true, false)).toBe("hovered");
  expect(itemLook(false, true)).toBe("disabled");
  expect(itemLook(true, true)).toBe("disabled");
});

test("↓ and ↑ move focus to a menu's next item or the one before, round from the last to the first and back", () => {
  fc.assert(
    fc.property(
      fc
        .integer({ min: 1, max: 10 })
        .chain((count) => fc.tuple(fc.constant(count), fc.nat(count - 1))),
      ([count, index]) => {
        expect(menuStep("down", index, count)).toBe((index + 1) % count);
        expect(menuStep("up", index, count)).toBe((index + count - 1) % count);
      },
    ),
  );
});

test("a panel opens above its button, its right edge at the button's, as wide as asked where the window has room, and no taller than the room above", () => {
  const window = { width: 1280, height: 720 };

  expect(panelPosition({ x: 1100, y: 690, width: 100, height: 24 }, window, 560)).toStrictEqual({
    right: 80,
    bottom: 36,
    width: 560,
    maxHeight: 676,
  });
  expect(
    panelPosition({ x: 300, y: 400, width: 100, height: 24 }, { width: 400, height: 500 }, 560),
  ).toStrictEqual({ right: 8, bottom: 106, width: 384, maxHeight: 386 });
  expect(panelPosition({ x: 0, y: 4, width: 10, height: 10 }, window, 100)).toMatchObject({
    maxHeight: 0,
  });
});
