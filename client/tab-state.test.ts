import * as fc from "fast-check";
import { expect, test } from "vitest";

import { groupName } from "../test/changes";
import { filePath } from "../test/file-names";
import type { Open } from "./groups";
import { startingTab, tabState } from "./tab-state";

// Anything that can be open: a file, files selected in a group, or a group.
const open: fc.Arbitrary<Open> = fc.oneof(
  fc.record({ group: groupName, path: filePath }, { noNullPrototype: true }),
  fc.record(
    { group: groupName, paths: fc.uniqueArray(filePath, { minLength: 2 }) },
    { noNullPrototype: true },
  ),
  fc.record({ group: groupName }, { noNullPrototype: true }),
);

test("a tab reads back what it kept: the file list's width, what's open, the groups collapsed and the filter", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 4000 }),
      fc.option(open, { nil: null }),
      fc.uniqueArray(groupName),
      fc.string({ unit: "binary" }),
      (fileListWidth, shown, collapsed, filter) => {
        const kept = { fileListWidth, open: shown, collapsed, filter };

        expect(tabState.parse(kept)).toStrictEqual(kept);
      },
    ),
  );
});

test("a tab that kept only the file list's width has nothing open, no group collapsed and no filter", () => {
  expect(tabState.parse({ fileListWidth: 380 })).toStrictEqual({
    fileListWidth: 380,
    open: null,
    collapsed: [],
    filter: "",
  });
});

test("a tab starts with the file list 280 wide, nothing open, no group collapsed and no filter", () => {
  expect(startingTab).toStrictEqual({ fileListWidth: 280, open: null, collapsed: [], filter: "" });
});

test("a tab that kept a group that isn't one isn't read", () => {
  expect(tabState.safeParse({ fileListWidth: 280, collapsed: ["ignored"] }).success).toBe(false);
});
