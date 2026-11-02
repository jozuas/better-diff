import * as fc from "fast-check";
import { expect, test } from "vitest";

import { fontSizes, sizeOptions } from "./fonts";

const panelFontSize = fc.integer({ min: 10, max: 21 });
const diffFontSize = fc.integer({ min: 9, max: 22 });

test("at Paseo's default font sizes, the panel's text is Paseo's sizes, and its lines are spaced as Paseo's diff's", () => {
  expect(fontSizes({ panelFontSize: 14, diffFontSize: 12 })).toStrictEqual({
    text: 14,
    small: 12,
    label: 11,
    code: 12,
    codeLine: 18,
    number: 44,
  });
});

test.each([
  [10, { text: 10, small: 9, label: 8 }],
  [18, { text: 18, small: 15, label: 14 }],
  [21, { text: 21, small: 18, label: 17 }],
])(
  "at a panel font size of %i, the smaller text scales with it, as Paseo's does",
  (size, sizes) => {
    expect(fontSizes({ panelFontSize: size, diffFontSize: 12 })).toMatchObject(sizes);
  },
);

test.each([
  [9, { code: 9, codeLine: 14, number: 35 }],
  [16, { code: 16, codeLine: 24, number: 56 }],
  [22, { code: 22, codeLine: 33, number: 74 }],
])(
  "at a diff font size of %i, the lines are half as tall again, and their numbers' column scales with it",
  (size, sizes) => {
    expect(fontSizes({ panelFontSize: 14, diffFontSize: size })).toMatchObject(sizes);
  },
);

test("the panel font size sizes only the panel's text, and the diff font size only the diff's lines", () => {
  fc.assert(
    fc.property(
      panelFontSize,
      panelFontSize,
      diffFontSize,
      diffFontSize,
      (panel, otherPanel, diff, otherDiff) => {
        const { text, small, label } = fontSizes({ panelFontSize: panel, diffFontSize: diff });
        const { codeLine, number } = fontSizes({ panelFontSize: otherPanel, diffFontSize: diff });

        expect(fontSizes({ panelFontSize: panel, diffFontSize: otherDiff })).toMatchObject({
          text,
          small,
          label,
        });
        expect(fontSizes({ panelFontSize: panel, diffFontSize: diff })).toMatchObject({
          code: diff,
          codeLine,
          number,
        });
      },
    ),
  );
});

test("a larger panel font size makes no text smaller, and the labels are no larger than the small text, which is smaller than the rest", () => {
  fc.assert(
    fc.property(panelFontSize, fc.integer({ min: 0, max: 11 }), (panel, more) => {
      const sizes = fontSizes({ panelFontSize: panel, diffFontSize: 12 });
      const larger = fontSizes({ panelFontSize: Math.min(panel + more, 21), diffFontSize: 12 });

      expect(larger.text).toBeGreaterThanOrEqual(sizes.text);
      expect(larger.small).toBeGreaterThanOrEqual(sizes.small);
      expect(larger.label).toBeGreaterThanOrEqual(sizes.label);
      expect(sizes.label).toBeLessThanOrEqual(sizes.small);
      expect(sizes.small).toBeLessThan(sizes.text);
    }),
  );
});

test("a size setting's choices are each whole size from its smallest to its largest, in order, named by the size", () => {
  fc.assert(
    fc.property(fc.integer({ min: -50, max: 50 }), fc.nat(40), (min, span) => {
      const options = sizeOptions({ min, max: min + span });

      expect(options).toHaveLength(span + 1);
      expect(options[0]?.value).toBe(String(min));
      expect(options.at(-1)?.value).toBe(String(min + span));

      for (const [index, option] of options.entries()) {
        expect(option.label).toBe(option.value);
        expect(Number(option.value)).toBe(min + index);
      }
    }),
  );
});

test("sizes 9 to 11 are three choices, each named by its size", () => {
  expect(sizeOptions({ min: 9, max: 11 })).toStrictEqual([
    { label: "9", value: "9" },
    { label: "10", value: "10" },
    { label: "11", value: "11" },
  ]);
});
