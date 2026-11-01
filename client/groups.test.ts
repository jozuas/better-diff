import * as fc from "fast-check";
import { expect, test } from "vitest";

import { filePath } from "../test/file-names";
import { groups, isOpen, openAfter, sidebarGroups } from "./groups";
import type { GroupName, OpenFile } from "./groups";

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

function modified(...paths: string[]) {
  return { modified: paths, untracked: [], staged: [] };
}

test("stays on a file its group still lists after an action, as after staging one of its hunks", () => {
  const open: OpenFile = { group: "modified", path: "b" };

  expect(openAfter(open, modified("a", "b", "c"), modified("a", "b", "c"))).toBe(open);
});

test("moves on to the next file its group still lists, once the open file leaves it", () => {
  expect(
    openAfter({ group: "modified", path: "b" }, modified("a", "b", "c", "d"), modified("a", "d")),
  ).toStrictEqual({ group: "modified", path: "d" });
});

test("moves back to the closest file before it, once the group's last file leaves it", () => {
  expect(
    openAfter({ group: "modified", path: "c" }, modified("a", "b", "c"), modified("a", "b")),
  ).toStrictEqual({ group: "modified", path: "b" });
});

test("moves to a file new to the group, once none it listed before are left", () => {
  expect(
    openAfter({ group: "modified", path: "a" }, modified("a"), modified("x", "y")),
  ).toStrictEqual({ group: "modified", path: "x" });
});

test("moves only within the open file's group", () => {
  expect(
    openAfter(
      { group: "staged", path: "a" },
      { modified: [], untracked: [], staged: ["a", "b"] },
      { modified: ["a"], untracked: [], staged: ["b"] },
    ),
  ).toStrictEqual({ group: "staged", path: "b" });
});

test("opens no file once the group lists none, whatever the others list", () => {
  expect(
    openAfter({ group: "modified", path: "a" }, modified("a"), {
      modified: [],
      untracked: ["b"],
      staged: ["a"],
    }),
  ).toBeUndefined();
});

test("stays on the open file without the list of changes from before or after the action", () => {
  const open: OpenFile = { group: "modified", path: "a" };

  expect(openAfter(open, modified("a"))).toBe(open);
  expect(openAfter(open, undefined, modified("b"))).toBe(open);
});

const changes = fc.record({
  modified: fc.uniqueArray(filePath),
  untracked: fc.uniqueArray(filePath),
  staged: fc.uniqueArray(filePath),
});

const groupName = fc.constantFrom<GroupName>("modified", "untracked", "staged");

test("opens a file the open one's group lists after the action, if it lists any", () => {
  fc.assert(
    fc.property(
      groupName,
      filePath,
      changes,
      changes,
      fc.uniqueArray(filePath, { minLength: 1 }),
      (group, path, before, after, listed) => {
        const next = openAfter({ group, path }, before, { ...after, [group]: listed });

        expect(next?.group).toBe(group);
        expect(listed).toContain(next?.path);
      },
    ),
  );
});

test("opens no file once the open one's group lists none", () => {
  fc.assert(
    fc.property(groupName, filePath, changes, changes, (group, path, before, after) => {
      expect(openAfter({ group, path }, before, { ...after, [group]: [] })).toBeUndefined();
    }),
  );
});
