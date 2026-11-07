import { expect, test } from "vitest";

import { isPlain } from "./syntax";
import type { Segment } from "./syntax";

test("a piece in the text's own colour, unmarked and not found, is plain, and any other isn't", () => {
  const plain: Segment = {
    start: 0,
    text: "a",
    color: undefined,
    mark: undefined,
    found: undefined,
  };

  expect(
    [
      plain,
      { ...plain, color: "#111111" },
      { ...plain, mark: "changed" as const },
      { ...plain, found: "match" as const },
    ].map((segment) => isPlain(segment)),
  ).toStrictEqual([true, false, false, false]);
});
