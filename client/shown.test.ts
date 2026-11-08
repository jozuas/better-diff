import * as fc from "fast-check";
import { expect, test } from "vitest";

import { whileShown } from "./shown";

interface Size {
  width: number;
  height: number;
}

const length = fc.integer({ min: 0, max: 4000 });

const someLength = fc.integer({ min: 1, max: 4000 });

// The size of a view on the page, which takes some width, or some height, or both.
const laidOut = fc.oneof(
  fc.record({ width: someLength, height: length }),
  fc.record({ width: length, height: someLength }),
);

// The sizes heard of a view laid out at the sizes in turn.
function heard(sizes: readonly Size[]): Size[] {
  const sizesHeard: Size[] = [];

  const onLayout = whileShown((size) => {
    sizesHeard.push(size);
  });

  for (const layout of sizes) {
    onLayout({ nativeEvent: { layout } });
  }

  return sizesHeard;
}

test("hears each size a view on the page is laid out at", () => {
  fc.assert(
    fc.property(laidOut, (size) => {
      expect(heard([size])).toStrictEqual([size]);
    }),
    { examples: [[{ width: 0, height: 1 }], [{ width: 1, height: 0 }]] },
  );
});

test("hears nothing of a view measured 0 by 0, as one in a hidden tab is", () => {
  expect(heard([{ width: 0, height: 0 }])).toStrictEqual([]);
});
