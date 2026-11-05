import * as fc from "fast-check";
import { expect, test } from "vitest";

import { viewSettings } from "./settings";

function valid(values: Record<string, number>): boolean {
  return viewSettings.schema.safeParse(values).success;
}

// Halfway between two whole sizes.
const fraction = fc.integer({ min: 0, max: 30 }).map((size) => size + 0.5);

test("without a document, diffs show in the auto style with room for lines of 80 characters, tab stops 8 columns apart, and the font sizes are 13, for the diff and the rest of the panel", () => {
  expect(viewSettings.schema.parse({})).toStrictEqual({
    diffStyle: "auto",
    lineLength: 80,
    tabSize: 8,
    diffFontSize: 13,
    panelFontSize: 13,
  });
});

test("each diff style is kept as picked", () => {
  for (const diffStyle of ["auto", "inline", "side by side"]) {
    expect(viewSettings.schema.parse({ diffStyle })).toMatchObject({ diffStyle });
  }
});

test("the line length takes each whole number of characters from 20 to 400", () => {
  fc.assert(
    fc.property(fc.integer({ min: 20, max: 400 }), (lineLength) => {
      expect(viewSettings.schema.parse({ lineLength })).toMatchObject({ lineLength });
    }),
    { examples: [[20], [400]] },
  );
});

test("the line length takes no number outside 20 to 400, nor a fraction", () => {
  fc.assert(
    fc.property(
      fc.oneof(fc.integer({ max: 19 }), fc.integer({ min: 401 }), fraction),
      (lineLength) => {
        expect(valid({ lineLength })).toBe(false);
      },
    ),
    { examples: [[19], [401], [80.5]] },
  );
});

test("the tab size takes each whole number of columns from 1 to 16", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 16 }), (tabSize) => {
      expect(viewSettings.schema.parse({ tabSize })).toMatchObject({ tabSize });
    }),
    { examples: [[1], [16]] },
  );
});

test("the tab size takes no number outside 1 to 16, nor a fraction", () => {
  fc.assert(
    fc.property(fc.oneof(fc.integer({ max: 0 }), fc.integer({ min: 17 }), fraction), (tabSize) => {
      expect(valid({ tabSize })).toBe(false);
    }),
    { examples: [[0], [17], [4.5]] },
  );
});

test("the panel font size takes each whole size Paseo's interface size does, 10 to 21, and keeps the diff's default", () => {
  fc.assert(
    fc.property(fc.integer({ min: 10, max: 21 }), (panelFontSize) => {
      expect(viewSettings.schema.parse({ panelFontSize })).toMatchObject({
        panelFontSize,
        diffFontSize: 13,
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
        panelFontSize: 13,
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
