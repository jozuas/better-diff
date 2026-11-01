import { expect, test } from "vitest";

import { groups, isOpen, sidebarGroups } from "./groups";
import type { OpenFile } from "./groups";

test("heads each group with its title and number of files: modified, then untracked, then staged", () => {
  expect(sidebarGroups({ modified: ["a", "b/c"], untracked: ["d"], staged: [] })).toStrictEqual([
    { name: "modified", heading: "MODIFIED FILES (2)", paths: ["a", "b/c"] },
    { name: "untracked", heading: "UNTRACKED FILES (1)", paths: ["d"] },
    { name: "staged", heading: "STAGED FILES (0)", paths: [] },
  ]);
});

test("opens a file from modified or untracked files on its unstaged diff, and from staged files on its staged one", () => {
  expect(groups).toStrictEqual({
    modified: { title: "MODIFIED FILES", status: "MODIFIED", side: "unstaged" },
    untracked: { title: "UNTRACKED FILES", status: "UNTRACKED", side: "unstaged" },
    staged: { title: "STAGED FILES", status: "STAGED", side: "staged" },
  });
});

test("a file is open only in the group it was opened from, under its own path", () => {
  const open: OpenFile = { group: "staged", path: "a" };

  expect(isOpen(open, "staged", "a")).toBe(true);
  expect(isOpen(open, "modified", "a")).toBe(false);
  expect(isOpen(open, "staged", "b")).toBe(false);
  expect(isOpen(undefined, "staged", "a")).toBe(false);
});
