import { expect, test } from "vitest";

import { countsOf } from "./counts";

test("counts a text diff's added and removed lines, with thousands separated", () => {
  expect(countsOf({ kind: "text", added: 1234, removed: 0 })).toStrictEqual({
    added: "+1,234",
    removed: "−0",
  });
});

test.each(["unchanged", "renamed", "symlink", "binary", "mode", "unmerged"] as const)(
  "counts nothing for a diff of kind %s",
  (kind) => {
    expect(countsOf({ kind, added: 0, removed: 0 })).toBeUndefined();
  },
);
