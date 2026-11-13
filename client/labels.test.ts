import { expect, test } from "vitest";

import { labelOf, unchangedButton } from "./labels";

test.each([
  ["unchanged", "No changes"],
  ["renamed", "Renamed"],
  ["symlink", "Symlink"],
  ["binary", "Binary file"],
  ["unmerged", "Merge conflicts"],
  ["whitespace", "Only whitespace changes"],
  ["submodule", "Submodule"],
  ["submodule files", "Submodule's files changed"],
  ["repository", "Git repository"],
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
  expect(unchangedButton(count, "hidden")).toStrictEqual({ label, hides: false });
});

test.each([
  [1, "Hide 1 unchanged line"],
  [27, "Hide 27 unchanged lines"],
])(
  "while %i of a hunk's unchanged lines before it show, says it hides them as %j",
  (count, label) => {
    expect(unchangedButton(count, "open")).toStrictEqual({ label, hides: true });
  },
);

test("the middle of a hunk's bar shows how many unchanged lines are left out before it, which shows them, or while they're open, hides them, and nothing while there are none, or a comment keeps them shown", () => {
  expect(unchangedButton(27, "hidden")).toStrictEqual({
    label: "27 unchanged lines",
    hides: false,
  });
  expect(unchangedButton(1, "open")).toStrictEqual({ label: "Hide 1 unchanged line", hides: true });
  expect(unchangedButton(27, "kept")).toBeUndefined();
  expect(unchangedButton(0, "hidden")).toBeUndefined();
  expect(unchangedButton(0, "open")).toBeUndefined();
});
