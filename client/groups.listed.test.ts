import * as fc from "fast-check";
import { expect, test } from "vitest";

import { changes } from "../test/changes";
import { listedBy, sidebarGroups } from "./groups";
import type { GroupName, OpenFile, SidebarGroup } from "./groups";

const sidebar = sidebarGroups({ modified: ["a", "b"], untracked: [], staged: ["a", "c"] });

test("↓ and ↑ open the file the group lists after the one with focus, or before it", () => {
  expect(listedBy(sidebar, [], { group: "modified", path: "a" }, 1)).toStrictEqual({
    group: "modified",
    path: "b",
  });
  expect(listedBy(sidebar, [], { group: "staged", path: "c" }, -1)).toStrictEqual({
    group: "staged",
    path: "a",
  });
});

test("↓ from a group's last file opens the first of the next group that lists any, and ↑ from it opens that last one again", () => {
  expect(listedBy(sidebar, [], { group: "modified", path: "b" }, 1)).toStrictEqual({
    group: "staged",
    path: "a",
  });
  expect(listedBy(sidebar, [], { group: "staged", path: "a" }, -1)).toStrictEqual({
    group: "modified",
    path: "b",
  });
});

test("↓ and ↑ pass over the files of a collapsed group", () => {
  const three = sidebarGroups({ modified: ["a"], untracked: ["b"], staged: ["c"] });

  expect(listedBy(three, ["untracked"], { group: "modified", path: "a" }, 1)).toStrictEqual({
    group: "staged",
    path: "c",
  });
});

test("↓ and ↑ open nothing past either end of the list", () => {
  expect(listedBy(sidebar, [], { group: "staged", path: "c" }, 1)).toBeUndefined();
  expect(listedBy(sidebar, [], { group: "modified", path: "a" }, -1)).toBeUndefined();
});

test("↓ and ↑ open nothing from a file the sidebar doesn't list, though another group lists it", () => {
  expect(listedBy(sidebar, ["modified"], { group: "modified", path: "a" }, 1)).toBeUndefined();
  expect(listedBy(sidebar, [], { group: "untracked", path: "a" }, 1)).toBeUndefined();
});

const groupNames: GroupName[] = ["modified", "untracked", "staged"];

// The groups the sidebar shows the files of.
function expanded(
  groups: readonly SidebarGroup[],
  collapsed: readonly GroupName[],
): SidebarGroup[] {
  return groups.filter(({ name }) => !collapsed.includes(name));
}

// Groups as the sidebar lists them, the groups collapsed, and the files it shows.
const listed = fc.tuple(changes, fc.subarray(groupNames)).map(([listedChanges, collapsed]) => {
  const groups = sidebarGroups(listedChanges);

  const shown = expanded(groups, collapsed).flatMap(({ name, paths }) =>
    paths.map((path) => ({ group: name, path })),
  );

  return { groups, collapsed, shown };
});

// Those the sidebar shows, with one of them.
const listedAndOne = listed
  .filter(({ shown }) => shown.length > 0)
  .chain((sidebarState) =>
    fc.tuple(fc.constant(sidebarState), fc.constantFrom(...sidebarState.shown)),
  );

// The files ↓ opens from the file each in turn, until it opens none.
function walkedDown(
  groups: readonly SidebarGroup[],
  collapsed: readonly GroupName[],
  file: OpenFile,
): OpenFile[] {
  const next = listedBy(groups, collapsed, file, 1);

  return next === undefined ? [file] : [file, ...walkedDown(groups, collapsed, next)];
}

// The file `there` opens from the file, then `back` from that: the file itself if `there` opens
// none.
function thereAndBack(
  groups: readonly SidebarGroup[],
  collapsed: readonly GroupName[],
  file: OpenFile,
  [there, back]: readonly [1 | -1, 1 | -1],
): OpenFile | undefined {
  const moved = listedBy(groups, collapsed, file, there);

  return moved === undefined ? file : listedBy(groups, collapsed, moved, back);
}

// The paths of the files of the group.
function pathsIn(files: readonly OpenFile[], name: GroupName): string[] {
  return files.flatMap(({ group, path }) => (group === name ? [path] : []));
}

// The file ↑ opens from the file each in turn, until it opens none.
function first(
  groups: readonly SidebarGroup[],
  collapsed: readonly GroupName[],
  file: OpenFile,
): OpenFile {
  const before = listedBy(groups, collapsed, file, -1);

  return before === undefined ? file : first(groups, collapsed, before);
}

test("↓ then ↑ opens the file with focus again, unless it's the last listed, and ↑ then ↓ unless it's the first", () => {
  fc.assert(
    fc.property(
      listedAndOne,
      fc.constantFrom<[1 | -1, 1 | -1]>([1, -1], [-1, 1]),
      ([{ groups, collapsed }, file], steps) => {
        expect(thereAndBack(groups, collapsed, file, steps)).toStrictEqual(file);
      },
    ),
  );
});

test("↓ from the first file shown opens each file the sidebar shows once, each group's in its order, and the groups' in the sidebar's", () => {
  fc.assert(
    fc.property(listedAndOne, ([{ groups, collapsed, shown }, file]) => {
      const walked = walkedDown(groups, collapsed, first(groups, collapsed, file));
      const names = walked.map(({ group }) => groupNames.indexOf(group));

      expect(walked).toHaveLength(shown.length);
      expect(names).toStrictEqual(names.toSorted((one, other) => one - other));

      for (const { name, paths } of expanded(groups, collapsed)) {
        expect(pathsIn(walked, name)).toStrictEqual(paths);
      }
    }),
  );
});
