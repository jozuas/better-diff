import * as fc from "fast-check";
import { expect, test } from "vitest";

import { changes, groupName } from "../test/changes";
import { filePath } from "../test/file-names";
import { sidebarGroups } from "./groups";
import type { GroupName, Open, OpenFile, SidebarGroup } from "./groups";
import {
  firstRow,
  indexOfStop,
  openRow,
  openStop,
  sidebarStops,
  stopBy,
  stopInPlace,
} from "./sidebar-stops";
import type { SidebarStop } from "./sidebar-stops";

// The sidebar's groups as changes.list lists them, and those of them collapsed.
const sidebar = fc.tuple(
  changes.map((listed) => sidebarGroups(listed)),
  fc.uniqueArray(groupName),
);

const order: GroupName[] = ["modified", "untracked", "staged"];

test("the sidebar's stops are each group's heading followed by the rows of the files it lists while it's expanded", () => {
  expect(
    sidebarStops(sidebarGroups({ modified: ["a", "b"], untracked: ["c"], staged: ["d"] }), [
      "untracked",
    ]),
  ).toStrictEqual([
    { group: "modified" },
    { group: "modified", path: "a" },
    { group: "modified", path: "b" },
    { group: "untracked" },
    { group: "staged" },
    { group: "staged", path: "d" },
  ]);
});

// The stops a step moves from each stop to in turn, from the stop given, until there's none.
function walked(
  stops: readonly SidebarStop[],
  from: SidebarStop | undefined,
  step: 1 | -1,
): SidebarStop[] {
  return from === undefined ? [] : [from, ...walked(stops, stopBy(stops, from, step), step)];
}

test("↓ from the first stop reaches each stop once, in order, and ↑ from the last each going back up", () => {
  fc.assert(
    fc.property(sidebar, ([groups, collapsed]) => {
      const stops = sidebarStops(groups, collapsed);

      expect(walked(stops, stops[0], 1)).toStrictEqual(stops);
      expect(walked(stops, stops.at(-1), -1)).toStrictEqual(stops.toReversed());
    }),
  );
});

// The heading of the group after the stop's.
function headingAfter({ group }: SidebarStop): SidebarStop | undefined {
  const next = order[order.indexOf(group) + 1];

  return next === undefined ? undefined : { group: next };
}

// The heading before the stop: its own group's for a row, and the group before's for a heading.
function headingBefore({ group, path }: SidebarStop): SidebarStop | undefined {
  const previous = path === undefined ? order[order.indexOf(group) - 1] : group;

  return previous === undefined ? undefined : { group: previous };
}

// The sidebar's stops, and one of them.
const someStop = sidebar.chain(([groups, collapsed]) => {
  const stops = sidebarStops(groups, collapsed);

  return fc.tuple(fc.constant(stops), fc.constantFrom(...stops));
});

test("with Alt, ↓ moves from any stop to the next group's heading, and ↑ to the heading before it, its own group's from a row", () => {
  fc.assert(
    fc.property(someStop, ([stops, from]) => {
      expect(stopBy(stops, from, 1, true)).toStrictEqual(headingAfter(from));
      expect(stopBy(stops, from, -1, true)).toStrictEqual(headingBefore(from));
    }),
  );
});

test("keys move from a stop the sidebar doesn't have to none", () => {
  fc.assert(
    fc.property(sidebar, filePath, fc.boolean(), ([groups, collapsed], path, headings) => {
      const stops = sidebarStops(groups, collapsed);
      const missing = { group: "modified" as const, path: `${path}/missing` };

      expect(stopBy(stops, missing, 1, headings)).toBeUndefined();
      expect(stopBy(stops, missing, -1, headings)).toBeUndefined();
    }),
  );
});

test("a stop's index is where the sidebar has it, and -1 where it doesn't", () => {
  const stops = sidebarStops(sidebarGroups({ modified: ["a"], untracked: ["a"], staged: [] }), []);

  expect(indexOfStop(stops, { group: "untracked", path: "a" })).toBe(3);
  expect(indexOfStop(stops, { group: "untracked" })).toBe(2);
  expect(indexOfStop(stops, { group: "staged", path: "a" })).toBe(-1);
});

test("the first row is that of the first file the sidebar lists, past headings and collapsed groups", () => {
  const groups = sidebarGroups({ modified: ["a"], untracked: ["b"], staged: [] });

  expect(firstRow(sidebarStops(groups, ["modified"]))).toStrictEqual({
    group: "untracked",
    path: "b",
  });
  expect(firstRow(sidebarStops(groups, ["modified", "untracked"]))).toBeUndefined();
});

test("the stop that takes the place of one gone is the one now at its index, or else the last", () => {
  const stops: SidebarStop[] = [{ group: "modified" }, { group: "modified", path: "a" }];

  expect(stopInPlace(stops, 1)).toStrictEqual({ group: "modified", path: "a" });
  expect(stopInPlace(stops, 5)).toStrictEqual({ group: "modified", path: "a" });
  expect(stopInPlace([], 0)).toBeUndefined();
});

test("what's open has the stop of the open file's row, of the row of the file the files selected reach, or of the open group's heading", () => {
  const nothing: undefined[] = [];

  expect(openStop({ group: "staged", path: "a" })).toStrictEqual({ group: "staged", path: "a" });
  expect(openStop({ group: "staged", paths: ["a", "b"] })).toStrictEqual({
    group: "staged",
    path: "b",
  });
  expect(openStop({ group: "staged" })).toStrictEqual({ group: "staged" });
  expect(openStop(nothing[0])).toBeUndefined();
});

// A file the sidebar lists in the groups, mostly, or another.
function someFile(groups: readonly SidebarGroup[]): fc.Arbitrary<OpenFile> {
  const rows = groups.flatMap(({ name, paths }) => paths.map((path) => ({ group: name, path })));
  const other = fc.record({ group: groupName, path: filePath });

  return rows.length === 0
    ? other
    : fc.oneof({ arbitrary: fc.constantFrom(...rows), weight: 4 }, other);
}

// What's open: nothing, a group, a file, or files selected, the last of them the file.
function someOpen(groups: readonly SidebarGroup[]): fc.Arbitrary<Open | undefined> {
  const file = someFile(groups);

  return fc.option(
    fc.oneof(
      groupName.map((group) => ({ group })),
      file,
      fc
        .tuple(file, fc.array(filePath, { minLength: 1, maxLength: 2 }))
        .map(([{ group, path }, before]) => ({ group, paths: [...before, path] })),
    ),
    { nil: undefined },
  );
}

// The row of the file open, or of the last of those selected, while its group is expanded and
// lists it.
function rowShown(
  groups: readonly SidebarGroup[],
  collapsed: readonly GroupName[],
  open: Open | undefined,
): SidebarStop | undefined {
  const path = open !== undefined && "paths" in open ? open.paths.at(-1) : open?.path;

  const shown = groups.some(
    ({ name, paths }) =>
      name === open?.group && !collapsed.includes(name) && paths.some((other) => other === path),
  );

  return open === undefined || path === undefined || !shown
    ? undefined
    : { group: open.group, path };
}

test("the open row is the open file's, or that of the file the files selected reach, while its group is expanded and lists it, and none while a group or nothing is open", () => {
  fc.assert(
    fc.property(
      sidebar.chain(([groups, collapsed]) =>
        fc.tuple(fc.constant(groups), fc.constant(collapsed), someOpen(groups)),
      ),
      ([groups, collapsed, open]) => {
        expect(openRow(sidebarStops(groups, collapsed), open)).toStrictEqual(
          rowShown(groups, collapsed, open),
        );
      },
    ),
  );
});
