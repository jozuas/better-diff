import * as fc from "fast-check";
import { expect, test } from "vitest";

import {
  barPosition,
  itemLook,
  itemName,
  menuEndingAt,
  menuPosition,
  menuStep,
  panelPosition,
} from "./menu";

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

// A point, and a menu that fits above it and to its left.
const endingFitting = fc.record({ x: length, y: length }).chain((point) =>
  fc.record({
    point: fc.constant(point),
    menu: fc.record({
      width: fc.integer({ min: 0, max: point.x }),
      height: fc.integer({ min: 0, max: point.y }),
    }),
  }),
);

test("a menu that ends at a point goes above it and to its left, its bottom right corner at the point, where there's room", () => {
  fc.assert(
    fc.property(endingFitting, ({ point, menu }) => {
      const { left, top } = menuEndingAt(point, menu);

      expect(left + menu.width).toBe(point.x);
      expect(top + menu.height).toBe(point.y);
    }),
  );
});

test("a menu that ends at a point never goes past the window's top or left edge, nor past the point", () => {
  fc.assert(
    fc.property(
      fc.record({ x: length, y: length }),
      fc.record({ width: length, height: length }),
      (point, menu) => {
        const { left, top } = menuEndingAt(point, menu);

        expect(left).toBeGreaterThanOrEqual(0);
        expect(top).toBeGreaterThanOrEqual(0);
        expect(left).toBeLessThanOrEqual(point.x);
        expect(top).toBeLessThanOrEqual(point.y);
      },
    ),
  );
});

test("a menu too wide and tall to end at a point goes to the window's top left corner", () => {
  expect(menuEndingAt({ x: 30, y: 20 }, { width: 100, height: 50 })).toStrictEqual({
    left: 0,
    top: 0,
  });
});

test("a menu's item is highlighted while the pointer is over it, unless it's disabled, which dims it", () => {
  expect(itemLook(false, false)).toBe("plain");
  expect(itemLook(true, false)).toBe("hovered");
  expect(itemLook(false, true)).toBe("disabled");
  expect(itemLook(true, true)).toBe("disabled");
});

test("a menu's item that asks to be chosen again looks it, though the pointer's over it, unless it's disabled", () => {
  expect(itemLook(false, false, true)).toBe("armed");
  expect(itemLook(true, false, true)).toBe("armed");
  expect(itemLook(true, true, true)).toBe("disabled");
  expect(itemLook(true, false, false)).toBe("hovered");
});

test("a menu's item is called by its label, and what it says after it, if anything", () => {
  expect(itemName("Reviewer")).toBe("Reviewer");
  expect(itemName("Reviewer", "Working")).toBe("Reviewer, Working");
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

// An area on the page, a bar no wider than it, where the pointer let go in it, the highest the page
// shows the area's lines from, a gap, and the corner of what the bar is placed in.
const shownBar = fc
  .record({
    x: fc.integer({ min: -500, max: 500 }),
    y: fc.integer({ min: -500, max: 500 }),
    width: length,
    height: length,
  })
  .chain((area) =>
    fc.record({
      area: fc.constant(area),
      bar: fc.record({ width: fc.integer({ min: 0, max: area.width }), height: length }),
      point: fc.record({
        x: fc.integer({ min: area.x, max: area.x + area.width }),
        y: fc.integer({ min: area.y, max: area.y + area.height }),
      }),
      origin: fc.record({
        x: fc.integer({ min: -900, max: 900 }),
        y: fc.integer({ min: -900, max: 900 }),
      }),
      ceiling: fc.integer({ min: -600, max: 600 }),
      gap: fc.integer({ min: 1, max: 20 }),
    }),
  );

test("shows a bar where the pointer let go of a selection inside its area, above the point by the gap where it's room under the area's top and the ceiling, and else below it", () => {
  fc.assert(
    fc.property(shownBar, fc.boolean(), ({ area, bar, point, origin, ceiling, gap }, centred) => {
      const { left, top } = barPosition({ point, area, origin, ceiling, centred }, bar, gap);
      const room = point.y - gap - bar.height >= Math.max(area.y, ceiling);

      expect(origin.x + left).toBeGreaterThanOrEqual(area.x);
      expect(origin.x + left + bar.width).toBeLessThanOrEqual(area.x + area.width);
      expect(origin.y + top + bar.height === point.y - gap).toBe(room);
      expect(origin.y + top === point.y + gap).toBe(!room);
    }),
  );
});

const placedIn = { x: 100, y: 50, width: 400, height: 300 };

// Where the bar is let go of at the point, in an area from its own corner.
function letGo(x: number, y: number, centred: boolean, area = placedIn) {
  return { point: { x, y }, area, origin: { x: area.x, y: area.y }, ceiling: 0, centred };
}

test("centres a bar on where the pointer let go of a selection, as far as its area leaves room", () => {
  const bar = { width: 60, height: 20 };

  expect(barPosition(letGo(300, 200, true), bar, 10)).toStrictEqual({ left: 170, top: 120 });
  expect(barPosition(letGo(110, 200, true), bar, 10).left).toBe(0);
  expect(barPosition(letGo(490, 200, true), bar, 10).left).toBe(340);
});

test("starts a bar shown for lines the keyboard selected at the start of the line's text, as far as its area leaves room", () => {
  const bar = { width: 60, height: 20 };

  expect(barPosition(letGo(130, 200, false), bar, 10)).toStrictEqual({ left: 30, top: 120 });
  expect(barPosition(letGo(480, 200, false), bar, 10).left).toBe(340);
});

test("places a bar from the corner of what it's in", () => {
  const at = { ...letGo(300, 200, true), origin: { x: 20, y: -30 } };

  expect(barPosition(at, { width: 60, height: 20 }, 10)).toStrictEqual({ left: 250, top: 200 });
});

test("shows a bar for a selection let go of past its area as at the area's edge", () => {
  const area = { x: 0, y: 100, width: 400, height: 300 };
  const bar = { width: 60, height: 20 };

  expect(barPosition(letGo(200, 900, true, area), bar, 10).top).toBe(270);
  expect(barPosition(letGo(200, 400, true, area), bar, 10).top).toBe(270);
  expect(barPosition(letGo(200, 20, true, area), bar, 10).top).toBe(10);
  expect(barPosition(letGo(200, 100, true, area), bar, 10).top).toBe(10);
});

test("shows a bar wider than its area from the area's left edge", () => {
  const area = { x: 100, y: 0, width: 40, height: 200 };

  expect(barPosition(letGo(150, 100, true, area), { width: 60, height: 20 }, 4).left).toBe(0);
});

test("shows a bar that just fits above where the pointer let go there", () => {
  const area = { x: 0, y: 40, width: 400, height: 300 };
  const bar = { width: 60, height: 20 };

  expect(barPosition({ ...letGo(200, 70, true, area), ceiling: 30 }, bar, 10).top).toBe(0);
  expect(barPosition({ ...letGo(200, 70, true, area), ceiling: 41 }, bar, 10).top).toBe(40);
});
