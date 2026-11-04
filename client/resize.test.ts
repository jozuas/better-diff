import * as fc from "fast-check";
import { expect, test } from "vitest";

import { defaultWidth, draggedWidth, fileListWidth, keyedStep } from "./resize";

const width = fc.integer({ min: -2000, max: 4000 });

// A panel wide enough for both, and a width wanted between the file list's narrowest and what
// leaves the diff its own.
const roomy = fc
  .integer({ min: 400, max: 4000 })
  .chain((panel) => fc.tuple(fc.integer({ min: 160, max: panel - 240 }), fc.constant(panel)));

test("gives the file list the width wanted while it's between 160 and what leaves the diff 240", () => {
  fc.assert(
    fc.property(roomy, ([wanted, panel]) => {
      expect(fileListWidth(wanted, panel)).toBe(wanted);
    }),
    { examples: [[[160, 400]], [[760, 1000]]] },
  );
});

test.each([
  [100, 1000, 160],
  [900, 1000, 760],
  [300, 300, 160],
])("gives the file list %i wide in a panel %i wide %i", (wanted, panel, given) => {
  expect(fileListWidth(wanted, panel)).toBe(given);
});

test("widens the file list no less as more is wanted", () => {
  fc.assert(
    fc.property(width, width, width, (wanted, more, panel) => {
      expect(fileListWidth(Math.max(wanted, more), panel)).toBeGreaterThanOrEqual(
        fileListWidth(wanted, panel),
      );
    }),
  );
});

test("starts the file list 280 wide", () => {
  expect(defaultWidth).toBe(280);
});

test.each([
  [150, 330],
  [40, 220],
  [100, 280],
])(
  "wants the width at a drag's start, 280 at 100, plus how far it's gone, to %i: %i",
  (x, wanted) => {
    expect(draggedWidth({ x: 100, width: 280 }, 300, x)).toBe(wanted);
  },
);

test("wants the width as it is without a drag", () => {
  expect(draggedWidth(null, 300, 150)).toBe(300);
});

const plain = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };

test("→ widens the file list by 10 pixels and ← narrows it by 10, or by 50 with Shift", () => {
  expect(keyedStep({ ...plain, key: "ArrowRight" })).toBe(10);
  expect(keyedStep({ ...plain, key: "ArrowLeft" })).toBe(-10);
  expect(keyedStep({ ...plain, shiftKey: true, key: "ArrowRight" })).toBe(50);
  expect(keyedStep({ ...plain, shiftKey: true, key: "ArrowLeft" })).toBe(-50);
});

test.each(["ArrowUp", "ArrowDown", "Enter", "a"])("%s doesn't resize the file list", (key) => {
  expect(keyedStep({ ...plain, key })).toBeUndefined();
});

test.each([{ altKey: true }, { ctrlKey: true }, { metaKey: true }])(
  "← and → don't resize the file list with another modifier: %o",
  (modifier) => {
    expect(keyedStep({ ...plain, ...modifier, key: "ArrowRight" })).toBeUndefined();
    expect(keyedStep({ ...plain, ...modifier, key: "ArrowLeft" })).toBeUndefined();
  },
);
