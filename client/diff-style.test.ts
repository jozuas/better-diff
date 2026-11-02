import * as fc from "fast-check";
import { expect, test } from "vitest";

import { showsSideBySide } from "./diff-style";

const width = fc.double({ min: 0, max: 10_000, noNaN: true });

const size = fc.double({ min: 1, max: 100, noNaN: true });

// A diff font size, and the width of its line numbers.
const fonts = fc.record({ code: size, number: size });

const lineLength = fc.integer({ min: 20, max: 400 });

test("an inline diff is inline, and a side-by-side one side by side, however wide, whatever its font sizes and line length", () => {
  fc.assert(
    fc.property(width, fonts, lineLength, (shown, sizes, length) => {
      expect(showsSideBySide({ diffStyle: "inline", lineLength: length }, shown, sizes)).toBe(
        false,
      );
      expect(showsSideBySide({ diffStyle: "side by side", lineLength: length }, shown, sizes)).toBe(
        true,
      );
    }),
  );
});

// Each side is half the width, less its line numbers and 8 pixels either side of the text, and fits
// characters 0.6 of the font size wide.
test("an auto diff shows side by side once each side has room for a line of the line length beside its line numbers", () => {
  const twelve = { code: 12, number: 44 };

  expect(showsSideBySide({ diffStyle: "auto", lineLength: 80 }, 1271.5, twelve)).toBe(false);
  expect(showsSideBySide({ diffStyle: "auto", lineLength: 80 }, 1272, twelve)).toBe(true);
  expect(showsSideBySide({ diffStyle: "auto", lineLength: 30 }, 551.5, twelve)).toBe(false);
  expect(showsSideBySide({ diffStyle: "auto", lineLength: 30 }, 552, twelve)).toBe(true);
});

test("an auto diff's room for a line is in its font size, beside numbers of their own width", () => {
  const layout = { diffStyle: "auto", lineLength: 54 } as const;

  expect(showsSideBySide(layout, 755.5, { code: 10, number: 38 })).toBe(false);
  expect(showsSideBySide(layout, 756, { code: 10, number: 38 })).toBe(true);
  expect(showsSideBySide(layout, 1463.5, { code: 20, number: 68 })).toBe(false);
  expect(showsSideBySide(layout, 1464, { code: 20, number: 68 })).toBe(true);
});

test("an auto diff side by side stays side by side wider", () => {
  fc.assert(
    fc.property(width, width, fonts, lineLength, (shown, wider, sizes, length) => {
      const layout = { diffStyle: "auto", lineLength: length } as const;

      expect(Number(showsSideBySide(layout, shown + wider, sizes))).toBeGreaterThanOrEqual(
        Number(showsSideBySide(layout, shown, sizes)),
      );
    }),
  );
});

test("an auto diff inline stays inline in a larger font, beside wider line numbers, or with a longer line length", () => {
  fc.assert(
    fc.property(
      width,
      fonts,
      size,
      fc.nat(400),
      lineLength,
      (shown, sizes, larger, longer, length) => {
        const layout = { diffStyle: "auto", lineLength: length } as const;
        const sideBySide = Number(showsSideBySide(layout, shown, sizes));

        expect(
          Number(showsSideBySide(layout, shown, { ...sizes, code: sizes.code + larger })),
        ).toBeLessThanOrEqual(sideBySide);
        expect(
          Number(showsSideBySide(layout, shown, { ...sizes, number: sizes.number + larger })),
        ).toBeLessThanOrEqual(sideBySide);
        expect(
          Number(showsSideBySide({ ...layout, lineLength: length + longer }, shown, sizes)),
        ).toBeLessThanOrEqual(sideBySide);
      },
    ),
  );
});
