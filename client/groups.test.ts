import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { diffRpc } from "../shared/diff";
import { filePath } from "../test/file-names";
import {
  diffIn,
  diffOf,
  groups,
  isGroupOpen,
  isOpen,
  isShown,
  listedFiles,
  measured,
  openAfter,
  placeholder,
  sidebarGroups,
  tallest,
  toggled,
} from "./groups";
import type { GroupName, OpenFile, OpenGroup } from "./groups";

test("heads each group with its title and number of files: modified, then untracked, then staged, and acts on all the files of each that has some", () => {
  expect(sidebarGroups({ modified: ["a", "b/c"], untracked: ["d"], staged: [] })).toStrictEqual([
    { name: "modified", heading: "MODIFIED FILES (2)", paths: ["a", "b/c"], files: ["a", "b/c"] },
    { name: "untracked", heading: "UNTRACKED FILES (1)", paths: ["d"], files: ["d"] },
    { name: "staged", heading: "STAGED FILES (0)", paths: [], files: undefined },
  ]);
});

test("lists only the files that match the filter, and heads a group that lists fewer with how many of its files it lists, and no action on all its files", () => {
  expect(
    sidebarGroups({ modified: ["src/a", "docs/b"], untracked: ["SRC/c"], staged: ["d"] }, "src"),
  ).toStrictEqual([
    { name: "modified", heading: "MODIFIED FILES (1 of 2)", paths: ["src/a"], files: undefined },
    { name: "untracked", heading: "UNTRACKED FILES (1)", paths: ["SRC/c"], files: ["SRC/c"] },
    { name: "staged", heading: "STAGED FILES (0 of 1)", paths: [], files: undefined },
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

test("a group is open only once its heading opens it, not one of its files", () => {
  const open: OpenGroup = { group: "staged" };

  expect(isGroupOpen(open, "staged")).toBe(true);
  expect(isGroupOpen(open, "modified")).toBe(false);
  expect(isGroupOpen({ group: "staged", path: "a" }, "staged")).toBe(false);
  expect(isGroupOpen(undefined, "staged")).toBe(false);
  expect(isOpen(open, "staged", "a")).toBe(false);
});

test("shows the diff of each file of the open group, and of the open file alone", () => {
  expect(isShown({ group: "staged" }, "staged", "a")).toBe(true);
  expect(isShown({ group: "staged" }, "modified", "a")).toBe(false);
  expect(isShown({ group: "staged", path: "a" }, "staged", "a")).toBe(true);
  expect(isShown({ group: "staged", path: "a" }, "staged", "b")).toBe(false);
  expect(isShown(undefined, "staged", "a")).toBe(false);
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

test("stays on the open group whatever the changes listed before and after an action", () => {
  fc.assert(
    fc.property(
      groupName,
      fc.option(changes, { nil: undefined }),
      fc.option(changes, { nil: undefined }),
      (group, before, after) => {
        const open: OpenGroup = { group };

        expect(openAfter(open, before, after)).toBe(open);
      },
    ),
  );
});

type Diff = RpcOutput<typeof diffRpc>;

function diffVersioned(version: string): Diff {
  return { version, kind: "text", added: 1, removed: 0, hunks: [], contents: { old: [], new: [] } };
}

test("shows the files of a group's read that the sidebar lists under the filter, in their order", () => {
  fc.assert(
    fc.property(fc.uniqueArray(filePath), fc.string({ unit: "binary" }), (paths, filter) => {
      const read = {
        version: "group",
        files: paths.map((path) => Object.assign(diffVersioned(path), { path })),
      };

      expect(listedFiles(read, filter).map(({ path }) => path)).toStrictEqual(
        sidebarGroups({ modified: paths, untracked: [], staged: [] }, filter)[0]?.paths,
      );
    }),
  );
});

test("finds the diff of a file of a group's read, unless the read couldn't read it", () => {
  const read = {
    version: "group",
    files: [Object.assign(diffVersioned("1"), { path: "a" }), { path: "b", error: "unreadable" }],
  };

  expect(diffIn(read, "a")).toStrictEqual({ ...diffVersioned("1"), path: "a" });
  expect(diffIn(read, "b")).toBeUndefined();
  expect(diffIn(read, "c")).toBeUndefined();
  expect(diffIn(undefined, "a")).toBeUndefined();
  expect(diffOf({ path: "b", error: "unreadable" })).toBeUndefined();
});

// Bars measured one after another, by their files' paths, some more than once.
const measures = fc.array(fc.tuple(fc.constantFrom("a", "b", "c", "d"), fc.nat()));

function measuredAll(all: readonly (readonly [string, number])[]): ReadonlyMap<string, number> {
  let heights: ReadonlyMap<string, number> = new Map();

  for (const [path, height] of all) {
    heights = measured(heights, path, height);
  }

  return heights;
}

test("keeps the height each file's bar was measured at last", () => {
  fc.assert(
    fc.property(measures, (all) => {
      const heights = measuredAll(all);

      for (const path of ["a", "b", "c", "d"]) {
        expect(heights.get(path)).toBe(all.findLast(([other]) => other === path)?.[1]);
      }
    }),
  );
});

test("keeps the same heights when a bar is measured at the height it has", () => {
  const heights = measured(new Map(), "a", 20);

  expect(measured(heights, "a", 20)).toBe(heights);
  expect(measured(heights, "a", 21)).not.toBe(heights);
});

test("makes the bars of the files listed as tall as the tallest of them, ignoring others'", () => {
  fc.assert(
    fc.property(measures, fc.subarray(["a", "b", "c", "d"]), (all, paths) => {
      const heights = measuredAll(all);
      const listed = [...heights].filter(([path]) => paths.includes(path));
      const height = tallest(heights, paths);

      expect([0, ...new Map(listed).values()]).toContain(height);

      for (const [, other] of listed) {
        expect(height).toBeGreaterThanOrEqual(other);
      }
    }),
  );
});

test("collapses each group whose triangle is pressed an odd number of times, and expands the others", () => {
  fc.assert(
    fc.property(fc.array(groupName), (presses) => {
      let collapsed: GroupName[] = [];

      for (const press of presses) {
        collapsed = toggled(collapsed, press);
      }

      for (const name of ["modified", "untracked", "staged"] satisfies GroupName[]) {
        const pressed = presses.filter((press) => press === name).length;

        expect(collapsed.includes(name)).toBe(pressed % 2 === 1);
      }
    }),
  );
});
