import { expect, test } from "vitest";

import { labelOf } from "./labels";

test.each([
  ["unchanged", "No changes"],
  ["renamed", "Renamed"],
  ["symlink", "Symlink"],
  ["binary", "Binary file"],
  ["mode", "File mode changed"],
  ["unmerged", "Merge conflicts"],
] as const)("labels a diff of kind %s %j instead of showing it", (kind, label) => {
  expect(labelOf({ kind, hunks: [] })).toBe(label);
});

test("labels a new or deleted empty file's diff, which has no lines, as an empty file", () => {
  expect(labelOf({ kind: "text", hunks: [] })).toBe("Empty file");
});

test("shows a diff with lines", () => {
  expect(
    labelOf({
      kind: "text",
      hunks: [{ oldStart: 1, newStart: 1, lines: [{ kind: "added", text: "a", newline: true }] }],
    }),
  ).toBeUndefined();
});
