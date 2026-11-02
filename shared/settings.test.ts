import * as fc from "fast-check";
import { expect, test } from "vitest";

import { viewSettings } from "./settings";

function valid(values: Record<string, number>): boolean {
  return viewSettings.schema.safeParse(values).success;
}

// Halfway between two whole sizes.
const fraction = fc.integer({ min: 0, max: 30 }).map((size) => size + 0.5);

test("diffs show inline until they're shown side by side", () => {
  expect(viewSettings.schema.parse({})).toMatchObject({ sideBySide: false });
  expect(viewSettings.schema.parse({ sideBySide: true })).toMatchObject({ sideBySide: true });
});

test("without a document, the font sizes are Paseo's defaults: 12 for the diff and 14 for the rest of the panel", () => {
  expect(viewSettings.schema.parse({})).toStrictEqual({
    sideBySide: false,
    diffFontSize: 12,
    panelFontSize: 14,
  });
});

test("the panel font size takes each whole size Paseo's interface size does, 10 to 21, and keeps the diff's default", () => {
  fc.assert(
    fc.property(fc.integer({ min: 10, max: 21 }), (panelFontSize) => {
      expect(viewSettings.schema.parse({ panelFontSize })).toMatchObject({
        panelFontSize,
        diffFontSize: 12,
      });
    }),
    { examples: [[10], [21]] },
  );
});

test("the panel font size takes no size outside 10 to 21, nor a fraction", () => {
  fc.assert(
    fc.property(
      fc.oneof(fc.integer({ max: 9 }), fc.integer({ min: 22 }), fraction),
      (panelFontSize) => {
        expect(valid({ panelFontSize })).toBe(false);
      },
    ),
    { examples: [[9], [22], [14.5]] },
  );
});

test("the diff font size takes each whole size Paseo's code size does, 9 to 22, and keeps the panel's default", () => {
  fc.assert(
    fc.property(fc.integer({ min: 9, max: 22 }), (diffFontSize) => {
      expect(viewSettings.schema.parse({ diffFontSize })).toMatchObject({
        panelFontSize: 14,
        diffFontSize,
      });
    }),
    { examples: [[9], [22]] },
  );
});

test("the diff font size takes no size outside 9 to 22, nor a fraction", () => {
  fc.assert(
    fc.property(
      fc.oneof(fc.integer({ max: 8 }), fc.integer({ min: 23 }), fraction),
      (diffFontSize) => {
        expect(valid({ diffFontSize })).toBe(false);
      },
    ),
    { examples: [[8], [23], [12.5]] },
  );
});
