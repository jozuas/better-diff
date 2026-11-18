import * as fc from "fast-check";
import { expect, test } from "vitest";

import { changes, groupName } from "../test/changes";
import { sidebarOf } from "../test/sidebar-keys";
import type { StopCommand } from "../test/sidebar-keys";
import { selectedBy, sidebarGroups } from "./groups";
import type { Open } from "./groups";
import type { CommandIn } from "./keymap";
import { filterKey, headingKey, listed, rowKey, settledStop } from "./sidebar-keys";
import { indexOfStop, openStop, sidebarStops } from "./sidebar-stops";
import type { SidebarStop } from "./sidebar-stops";

// The sidebar's groups as changes.list lists them, and one of its stops.
const someStop = changes.chain((listedChanges) => {
  const groups = sidebarGroups(listedChanges);

  return fc.tuple(fc.constant(groups), fc.constantFrom(...sidebarStops(groups, [])));
});

// What a key moving focus to the stop does: opens its file, if it's a row's, or while the key is
// held down, passes it, to open once keys stop passing it, and moves focus to it, or past the
// first, to the filter.
function movedTo(stop: SidebarStop | undefined, step: 1 | -1, repeat: boolean): unknown[] {
  if (stop === undefined) {
    return step === 1 ? [{ stop }] : ["filter", { stop }];
  }

  const file = { group: stop.group, path: stop.path };

  return stop.path === undefined
    ? [{ stop }]
    : [repeat ? { pass: file } : { open: file }, { stop }];
}

test("↓ and ↑ in a row or heading move focus to the next stop or the one before, opening the file of a row they reach, or while held down, once keys stop passing it, and up past the first heading to the filter", () => {
  fc.assert(
    fc.property(
      someStop,
      fc.constantFrom<[1 | -1, StopCommand]>([1, "down"], [-1, "up"]),
      fc.boolean(),
      ([groups, from], [step, command], repeat) => {
        const { done, sidebar, key } = sidebarOf(groups, undefined, repeat);
        const reached = sidebar.list.stops[indexOfStop(sidebar.list.stops, from) + step];

        expect(key(from, command)).toBe(true);
        expect(done).toStrictEqual(movedTo(reached, step, repeat));
      },
    ),
  );
});

test("with Alt, ↓ and ↑ move focus from heading to heading, opening nothing", () => {
  const { done, key } = sidebarOf(
    sidebarGroups({ modified: ["a", "c"], untracked: ["b"], staged: [] }),
  );

  key({ group: "modified", path: "a" }, "groupDown");
  key({ group: "modified" }, "groupDown");
  key({ group: "untracked", path: "b" }, "groupUp");
  key({ group: "modified", path: "c" }, "groupUp");
  key({ group: "untracked" }, "groupUp");
  key({ group: "modified" }, "groupUp");

  expect(done).toStrictEqual([
    { stop: { group: "untracked" } },
    { stop: { group: "untracked" } },
    { stop: { group: "untracked" } },
    { stop: { group: "modified" } },
    { stop: { group: "modified" } },
    "filter",
    { stop: undefined },
  ]);
});

test("↓ on the last stop moves focus nowhere, and not to the filter", () => {
  const { done, key } = sidebarOf(sidebarGroups({ modified: ["a"], untracked: [], staged: [] }));

  expect(key({ group: "staged" }, "down")).toBe(true);
  expect(done).toStrictEqual([{ stop: undefined }]);
});

test("with Shift, ↓ and ↑ in a row select one more file or one fewer, and move focus to the file the selection reaches", () => {
  const groups = sidebarGroups({ modified: ["a", "b", "c"], untracked: [], staged: [] });
  const a = { group: "modified", path: "a" } as const;
  const { done, sidebar, row } = sidebarOf(groups, a);

  expect(rowKey("selectDown", row(a), sidebar)).toBe(true);
  expect(rowKey("selectUp", row(a), sidebar)).toBe(true);
  expect(done).toStrictEqual([
    { open: selectedBy(a, a, ["a", "b", "c"], 1) },
    { stop: { group: "modified", path: "b" } },
    { open: a },
    { stop: a },
  ]);
});

test("→ in a row moves focus into its file's diff, opening the file if the view doesn't show it, and the menu key opens its menu", () => {
  const groups = sidebarGroups({ modified: ["a"], untracked: [], staged: [] });
  const { done, sidebar, row } = sidebarOf(groups);
  const a = { group: "modified", path: "a" } as const;

  expect(rowKey("into", row(a), sidebar)).toBe(true);
  expect(rowKey("menu", row(a), sidebar)).toBe(true);
  expect(done).toStrictEqual([{ file: a }, { open: a }, "menu"]);
});

test("in a selected file's row, Escape opens just that file, and in another row, or while one file or none is open, does nothing", () => {
  const groups = sidebarGroups({ modified: ["a", "b", "c"], untracked: [], staged: [] });
  const a = { group: "modified", path: "a" } as const;
  const selected = sidebarOf(groups, { group: "modified", paths: ["a", "b"] });
  const single = sidebarOf(groups, a);
  const nothing = sidebarOf(groups);

  expect(rowKey("single", selected.row({ ...a, path: "b" }), selected.sidebar)).toBe(true);
  expect(rowKey("single", selected.row({ ...a, path: "c" }), selected.sidebar)).toBe(false);
  expect(rowKey("single", single.row(a), single.sidebar)).toBe(false);
  expect(rowKey("single", nothing.row(a), nothing.sidebar)).toBe(false);
  expect([selected.done, single.done, nothing.done]).toStrictEqual([
    [{ open: { ...a, path: "b" } }],
    [],
    [],
  ]);
});

test.each<[CommandIn<"heading">, boolean, boolean, unknown[]]>([
  ["collapse", true, false, [{ toggle: "untracked" }]],
  ["collapse", true, true, [{ toggle: "untracked" }]],
  ["collapse", false, false, []],
  ["expand", false, false, [{ toggle: "untracked" }]],
  ["expand", false, true, [{ toggle: "untracked" }]],
  ["expand", true, false, [{ open: { group: "untracked" } }, { into: "untracked", open: false }]],
  ["expand", true, true, [{ into: "untracked", open: true }]],
])(
  "in a heading, %s with the group expanded: %s, and open: %s, does %o",
  (command, expanded, opened, did) => {
    const { done, sidebar, heading } = sidebarOf(
      sidebarGroups({ modified: [], untracked: ["a"], staged: [] }),
    );

    expect(headingKey(command, heading("untracked", { expanded, opened }), sidebar)).toBe(true);
    expect(done).toStrictEqual(did);
  },
);

test("↓ and Enter in the filter move focus to the first file it lists, opening it, and do nothing while it lists none", () => {
  const groups = sidebarGroups({ modified: [], untracked: ["c"], staged: [] });
  const { done, sidebar } = sidebarOf(groups);
  const none = sidebarOf(sidebarGroups({ modified: [], untracked: [], staged: [] }));

  const filter = {
    filter: "c",
    onFilter: (typed: string) => {
      none.done.push({ filter: typed });
    },
  };

  expect(filterKey("first", filter, sidebar.list, sidebar.focus)).toBe(true);
  expect(filterKey("first", filter, none.sidebar.list, none.sidebar.focus)).toBe(false);
  expect(done).toStrictEqual([
    { open: { group: "untracked", path: "c" } },
    { row: { group: "untracked", path: "c" } },
  ]);
  expect(none.done).toStrictEqual([]);
});

test("in the filter, Escape clears it, or once it's empty moves focus to what's open", () => {
  const groups = sidebarGroups({ modified: ["a"], untracked: [], staged: [] });
  const open = { group: "modified", paths: ["a", "b"] } as const;
  const { done, sidebar } = sidebarOf(groups, open);
  const filters: string[] = [];

  function onFilter(filter: string): void {
    filters.push(filter);
  }

  expect(filterKey("clear", { filter: "a", onFilter }, sidebar.list, sidebar.focus)).toBe(true);
  expect([filters, done]).toStrictEqual([[""], []]);
  expect(filterKey("clear", { filter: "", onFilter }, sidebar.list, sidebar.focus)).toBe(true);
  expect([filters, done]).toStrictEqual([[""], [{ stop: openStop(open) }]]);
});

// MODIFIED's heading, a's and b's rows, and the other groups' headings.
const twoFiles = sidebarGroups({ modified: ["a", "b"], untracked: [], staged: [] });
const rowA = { group: "modified", path: "a" } as const;
const rowB = { group: "modified", path: "b" } as const;

test.each<
  [number | undefined, boolean, boolean, Open | undefined, number | undefined, SidebarStop[]]
>([
  [undefined, false, true, rowA, undefined, []],
  [1, true, true, rowA, 1, []],
  [1, false, false, rowA, undefined, []],
  [1, false, true, undefined, undefined, [rowA]],
  [9, false, true, undefined, undefined, [{ group: "staged" }]],
  [4, false, true, rowB, undefined, [rowB]],
  [0, false, true, { group: "modified", paths: ["b", "a"] }, undefined, [rowA]],
  [1, false, true, { group: "modified" }, undefined, [rowA]],
  [2, false, true, { group: "staged", path: "a" }, undefined, [rowB]],
])(
  "with the place %j held, an action running: %s, nothing focused: %s, and %o open, the place held is then %j, and focus moves to %o",
  (held, busy, unfocused, open, after, moved) => {
    const { done, sidebar } = sidebarOf(twoFiles, open);

    expect(settledStop(held, { busy, unfocused }, sidebar.list, sidebar.focus)).toBe(after);
    expect(done).toStrictEqual(moved.map((stop) => ({ stop })));
  },
);

test("the files listed of a group are its paths, and none of a group the sidebar doesn't have", () => {
  fc.assert(
    fc.property(changes, groupName, (listedChanges, group) => {
      const groups = sidebarGroups(listedChanges);

      expect(listed({ groups }, group)).toStrictEqual(listedChanges[group]);
      expect(listed({ groups: [] }, group)).toStrictEqual([]);
    }),
  );
});
