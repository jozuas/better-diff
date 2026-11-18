import { expect, test } from "vitest";

import { onRun, sidebarOf } from "../test/sidebar-keys";
import { groupActions, rowActions } from "./actions";
import { sidebarGroups } from "./groups";
import type { Open } from "./groups";
import { groupBar, headingKey, rowBar, rowKey } from "./sidebar-keys";
import type { RowKeys } from "./sidebar-keys";

test("in a row, Shift+Enter and Shift+Backspace press its buttons, on the files selected in one of theirs, and in a heading its group's, while it has them", () => {
  const selected: Open = { group: "modified", paths: ["a", "b"] };
  const groups = { modified: ["a", "b"], untracked: [], staged: ["c"] };
  const { done, sidebar, row, heading } = sidebarOf(sidebarGroups(groups), selected);
  const filtered = sidebarOf(sidebarGroups(groups, "a"));

  expect([
    rowKey("stageFile", row({ group: "staged", path: "c" }), sidebar),
    rowKey("discardFile", row({ group: "modified", path: "b" }), sidebar),
    headingKey("stageFile", heading("modified"), sidebar),
    headingKey("discardFile", heading("staged"), sidebar),
  ]).toStrictEqual([true, true, true, true]);
  expect(headingKey("discardFile", heading("untracked"), sidebar)).toBe(false);
  expect(headingKey("stageFile", filtered.heading("modified"), filtered.sidebar)).toBe(false);
  expect(done).toStrictEqual([
    { press: "file:staged:c:unstage" },
    { press: 'selected:modified:["a","b"]:b:discard' },
    { press: "group:modified:stage" },
    { press: "group:staged:unstage" },
  ]);
  expect(filtered.done).toStrictEqual([]);
});

test("in a row, Enter and Backspace press its buttons as they do with Shift, and Enter with focus on one of its buttons, which it presses, does nothing more", () => {
  const selected: Open = { group: "untracked", paths: ["a", "b"] };
  const groups = { modified: ["c"], untracked: ["a", "b"], staged: ["d"] };
  const { done, sidebar, row } = sidebarOf(sidebarGroups(groups), selected);
  const c = { group: "modified", path: "c" } as const;

  expect([
    rowKey("stage", row(c), sidebar),
    rowKey("discard", row(c), sidebar),
    rowKey("stage", row({ group: "untracked", path: "a" }), sidebar),
    rowKey("discard", row({ group: "staged", path: "d" }), sidebar),
    rowKey("discard", row(c, false), sidebar),
    rowKey("stageFile", row(c, false), sidebar),
    rowKey("discardFile", row(c, false), sidebar),
  ]).toStrictEqual([true, true, true, true, true, true, true]);
  expect(rowKey("stage", row(c, false), sidebar)).toBe(false);
  expect(done).toStrictEqual([
    { press: "file:modified:c:stage" },
    { press: "file:modified:c:discard" },
    { press: 'selected:untracked:["a","b"]:a:stage' },
    { press: "file:staged:d:unstage" },
    { press: "file:modified:c:discard" },
    { press: "file:modified:c:stage" },
    { press: "file:modified:c:discard" },
  ]);
});

test("a key that runs an action does nothing in the row of a file without that action, and nothing else hears it", () => {
  const groups = sidebarGroups({ modified: [], untracked: [], staged: ["a"] });
  const { done, sidebar } = sidebarOf(groups);
  const a = { group: "staged", path: "a" } as const;

  const bare: RowKeys = {
    stop: a,
    bar: rowBar(rowActions(undefined, a, "repository"), onRun),
    own: true,
    onMenu: onRun,
  };

  expect(
    (["stage", "discard", "stageFile", "discardFile"] as const).map((command) =>
      rowKey(command, bare, sidebar),
    ),
  ).toStrictEqual([true, true, true, true]);
  expect(done).toStrictEqual([]);
});

test("a row's keys run its actions, and a heading's run its group's while it lists all its files", () => {
  const file = { group: "staged", path: "a" } as const;
  const none: string[][] = [];

  expect(rowBar(rowActions(undefined, file), onRun)).toStrictEqual({
    actions: rowActions(undefined, file).actions,
    bar: "file:staged:a",
    target: rowActions(undefined, file).target,
    onRun,
  });
  expect(groupBar("staged", ["a", "b"], onRun)).toStrictEqual({
    actions: groupActions.staged,
    bar: "group:staged",
    target: { group: "staged", paths: ["a", "b"] },
    onRun,
  });
  expect(groupBar("staged", none[0], onRun)).toBeUndefined();
});
