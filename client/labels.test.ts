import { expect, test } from "vitest";

import { labelOf, unchangedLabel } from "./labels";

test.each([
  ["unchanged", "No changes"],
  ["renamed", "Renamed"],
  ["symlink", "Symlink"],
  ["binary", "Binary file"],
  ["unmerged", "Merge conflicts"],
  ["whitespace", "Only whitespace changes"],
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
      hunks: [
        {
          oldStart: 1,
          newStart: 1,
          lines: [{ kind: "added", text: "a", newline: true, runs: [] }],
        },
      ],
    }),
  ).toBeUndefined();
});

test.each([
  [1, "1 unchanged line"],
  [2, "2 unchanged lines"],
  [27, "27 unchanged lines"],
])("says %i of a hunk's unchanged lines left out before it as %j", (count, label) => {
  expect(unchangedLabel(count)).toBe(label);
});
