import * as fc from "fast-check";
import { expect, test } from "vitest";

import { filePath } from "../test/file-names";
import { groups, isOpen, openAfter, placeholder, sidebarGroups } from "./groups";
import type { GroupName, OpenFile } from "./groups";

test("heads each group with its title and number of files: modified, then untracked, then staged", () => {
  expect(sidebarGroups({ modified: ["a", "b/c"], untracked: ["d"], staged: [] })).toStrictEqual([
    { name: "modified", heading: "MODIFIED FILES (2)", paths: ["a", "b/c"] },
    { name: "untracked", heading: "UNTRACKED FILES (1)", paths: ["d"] },
    { name: "staged", heading: "STAGED FILES (0)", paths: [] },
  ]);
});

test("lists only the files that match the filter, and heads a group that lists fewer with how many of its files it lists", () => {
  expect(
    sidebarGroups({ modified: ["src/a", "docs/b"], untracked: ["SRC/c"], staged: ["d"] }, "src"),
  ).toStrictEqual([
    { name: "modified", heading: "MODIFIED FILES (1 of 2)", paths: ["src/a"] },
    { name: "untracked", heading: "UNTRACKED FILES (1)", paths: ["SRC/c"] },
    { name: "staged", heading: "STAGED FILES (0 of 1)", paths: [] },
  ]);
});

// A path, and a part of it with the case of each letter changed or not.
const pathAndPart = fc
  .tuple(filePath, fc.nat(), fc.nat(), fc.array(fc.boolean()))
  .map(([path, start, length, raised]) => {
    const from = start % (path.length + 1);

    const part = path
      .slice(from, from + length)
      .split("")
      .map((unit, index) => (raised[index] === true ? unit.toUpperCase() : unit.toLowerCase()))
      .join("");

    return { path, part };
  });

// The files a group lists of its only file, filtered by the filter.
function listedOf(path: string, filter: string): string[] {
  return sidebarGroups({ modified: [path], untracked: [], staged: [] }, filter)[0]?.paths ?? [];
}

test("lists a file when filtered by any part of its path, whatever the case of its letters", () => {
  fc.assert(
    fc.property(pathAndPart, ({ path, part }) => {
      expect(listedOf(path, part)).toStrictEqual([path]);
    }),
  );
});

test("hides a file when filtered by something with a character its path hasn't", () => {
  fc.assert(
    fc.property(
      filePath,
      fc.string({ unit: "binary" }),
      fc.string({ unit: "binary" }),
      (path, before, after) => {
        expect(listedOf(path.replaceAll("x", ""), `${before}x${after}`)).toStrictEqual([]);
      },
    ),
  );
});

test("opens a file from modified or untracked files on its unstaged diff, and from staged files on its staged one", () => {
  expect(groups).toStrictEqual({
    modified: { title: "MODIFIED FILES", status: "MODIFIED", side: "unstaged" },
    untracked: { title: "UNTRACKED FILES", status: "UNTRACKED", side: "unstaged" },
    staged: { title: "STAGED FILES", status: "STAGED", side: "staged" },
  });
});

test('says "No changes" in place of a diff once no group lists a file', () => {
  expect(placeholder({ modified: [], untracked: [], staged: [] })).toBe("No changes");
});

test.each(["modified", "untracked", "staged"] as const)(
  "asks to open a file while %s files has one",
  (name) => {
    expect(placeholder({ modified: [], untracked: [], staged: [], [name]: ["a"] })).toBe(
      "Select a file to see its changes.",
    );
  },
);

test("says nothing in place of a diff until the changes are listed", () => {
  expect(placeholder()).toBe("");
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

test("opens no file when none was open", () => {
  expect(openAfter(undefined, modified("a"), modified("a", "b"))).toBeUndefined();
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
