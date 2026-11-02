import { expect, test } from "vitest";

import { labelOf } from "./labels";

test.each([
  ["unchanged", "No changes"],
  ["renamed", "Renamed"],
  ["symlink", "Symlink"],
  ["binary", "Binary file"],
  ["unmerged", "Merge conflicts"],
] as const)("labels a diff of kind %s %j instead of showing it", (kind, label) => {
  expect(labelOf({ kind, hunks: [] })).toBe(label);
});

test("shows a mode change on its own without a label, as its bar shows it", () => {
  expect(labelOf({ kind: "mode", hunks: [] })).toBeUndefined();
});

test("labels a new or deleted empty file's diff, which has no lines, as an empty file", () => {
  expect(labelOf({ kind: "text", hunks: [] })).toBe("Empty file");
});

test.each([
  ["generated", "Generated file"],
  ["large", "Large diff"],
] as const)("labels a diff collapsed as %s %j", (collapsed, label) => {
  expect(labelOf({ kind: "text", hunks: [], collapsed })).toBe(label);
});

test("shows a diff with lines", () => {
  expect(
    labelOf({
      kind: "text",
      hunks: [{ oldStart: 1, newStart: 1, lines: [{ kind: "added", text: "a", newline: true }] }],
    }),
  ).toBeUndefined();
});
