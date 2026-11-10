import { expect, test } from "vitest";

import type { Action, ButtonLook, TextLook } from "./actions";
import {
  buttonLook,
  buttonOf,
  buttonText,
  fileActions,
  fileBarOf,
  groupActions,
  hunkActions,
  hunkLines,
  lineActions,
  modeActions,
  rowActions,
  sidebarButtonName,
  textButtonLook,
} from "./actions";
import type { GroupName, OpenFiles } from "./groups";

test("offers discarding and staging a modified file, deleting and staging an untracked one, and unstaging a staged one, asking before discarding or deleting", () => {
  expect(fileActions).toStrictEqual({
    modified: [
      { operation: "discard", label: "Discard", confirmation: "Confirm discard?", icon: "Undo2" },
      { operation: "stage", label: "Stage", icon: "Plus" },
    ],
    untracked: [
      { operation: "discard", label: "Delete", confirmation: "Confirm delete?", icon: "Trash2" },
      { operation: "stage", label: "Stage", icon: "Plus" },
    ],
    staged: [{ operation: "unstage", label: "Unstage", icon: "Minus" }],
  });
});

test("offers discarding and staging all modified files, deleting and staging all untracked ones, and unstaging all staged ones, asking before discarding or deleting", () => {
  expect(groupActions).toStrictEqual({
    modified: [
      {
        operation: "discard",
        label: "Discard All",
        confirmation: "Confirm discard?",
        icon: "Undo2",
      },
      { operation: "stage", label: "Stage All", icon: "Plus" },
    ],
    untracked: [
      {
        operation: "discard",
        label: "Delete All",
        confirmation: "Confirm delete?",
        icon: "Trash2",
      },
      { operation: "stage", label: "Stage All", icon: "Plus" },
    ],
    staged: [{ operation: "unstage", label: "Unstage All", icon: "Minus" }],
  });
});

// The actions on the row of a file selected in the group.
function selectionActionsOf(group: GroupName): Action[] {
  return rowActions({ group, paths: ["a", "b"] }, { group, path: "a" }).actions;
}

test("offers discarding and staging the modified files selected, deleting and staging the untracked ones, and unstaging the staged ones, asking before discarding or deleting", () => {
  expect(selectionActionsOf("modified")).toStrictEqual([
    {
      operation: "discard",
      label: "Discard Selected",
      confirmation: "Confirm discard?",
      icon: "Undo2",
    },
    { operation: "stage", label: "Stage Selected", icon: "Plus" },
  ]);
  expect(selectionActionsOf("untracked")).toStrictEqual([
    {
      operation: "discard",
      label: "Delete Selected",
      confirmation: "Confirm delete?",
      icon: "Trash2",
    },
    { operation: "stage", label: "Stage Selected", icon: "Plus" },
  ]);
  expect(selectionActionsOf("staged")).toStrictEqual([
    { operation: "unstage", label: "Unstage Selected", icon: "Minus" },
  ]);
});

test("a file's row acts on its file, which its buttons name, as shown while it's open or its group is", () => {
  const file = { group: "modified", path: "a" } as const;

  expect(rowActions({ group: "modified", path: "b" }, file)).toStrictEqual({
    actions: fileActions.modified,
    target: { file, shown: false },
    row: "file:modified:a",
    path: "a",
  });
  expect(rowActions(file, file).target).toStrictEqual({ file, shown: true });
  expect(rowActions({ group: "modified" }, file).target).toStrictEqual({ file, shown: true });
  expect(rowActions(undefined, file).target).toStrictEqual({ file, shown: false });
});

test("a selected file's row acts on all the files selected, and its buttons name none", () => {
  const open: OpenFiles = { group: "untracked", paths: ["b", "a"] };
  const { actions, target, path } = rowActions(open, { group: "untracked", path: "a" });

  expect(actions).toStrictEqual(selectionActionsOf("untracked"));
  expect(target).toStrictEqual({ group: "untracked", paths: ["b", "a"], selected: true });
  expect(path).toBeUndefined();
});

test("the row of a file not selected acts on its file while others are selected", () => {
  const open: OpenFiles = { group: "untracked", paths: ["b", "a"] };

  expect(rowActions(open, { group: "untracked", path: "c" }).target).toStrictEqual({
    file: { group: "untracked", path: "c" },
    shown: false,
  });
  expect(rowActions(open, { group: "staged", path: "a" }).actions).toBe(fileActions.staged);
});

test("tells each row's buttons apart, and a selected row's from its own while it isn't, or while other files are selected", () => {
  const rows = [
    rowActions(undefined, { group: "modified", path: "a" }),
    rowActions(undefined, { group: "modified", path: "b" }),
    rowActions(undefined, { group: "staged", path: "a" }),
    rowActions({ group: "modified", paths: ["a", "b"] }, { group: "modified", path: "a" }),
    rowActions({ group: "modified", paths: ["a", "b"] }, { group: "modified", path: "b" }),
    rowActions({ group: "modified", paths: ["a", "b", "c"] }, { group: "modified", path: "a" }),
    rowActions({ group: "staged", paths: ["a", "b"] }, { group: "staged", path: "a" }),
  ].map(({ row }) => row);

  expect(new Set(rows).size).toBe(rows.length);
});

test("tells each bar's buttons apart, and a file's bar's in one version of its diff from another's", () => {
  const buttons = [
    buttonOf(fileBarOf("1"), { operation: "stage" }),
    buttonOf(fileBarOf("1"), { operation: "discard" }),
    buttonOf(fileBarOf("2"), { operation: "stage" }),
    buttonOf("1:hunk 0", { operation: "stage" }),
    buttonOf("1:hunk 0", { operation: "unstage" }),
    buttonOf("1:hunk 1", { operation: "stage" }),
  ];

  expect(new Set(buttons).size).toBe(buttons.length);
});

test("offers discarding and staging a modified or untracked file's hunk, and unstaging a staged one's, asking before discarding", () => {
  const discardOrStage = [
    { operation: "discard", label: "Discard Hunk", confirmation: "Confirm discard?" },
    { operation: "stage", label: "Stage Hunk" },
  ];

  expect(hunkActions).toStrictEqual({
    modified: discardOrStage,
    untracked: discardOrStage,
    staged: [{ operation: "unstage", label: "Unstage Hunk" }],
  });
});

test("offers discarding and staging a modified or untracked file's selected lines, and unstaging a staged one's, asking before discarding, with the sidebar's icons", () => {
  const discardOrStage = [
    {
      operation: "discard",
      label: "Discard Lines",
      confirmation: "Confirm discard?",
      icon: "Undo2",
    },
    { operation: "stage", label: "Stage Lines", icon: "Plus" },
  ];

  expect(lineActions).toStrictEqual({
    modified: discardOrStage,
    untracked: discardOrStage,
    staged: [{ operation: "unstage", label: "Unstage Lines", icon: "Minus" }],
  });
});

test("offers discarding and staging a modified file's mode change, and unstaging a staged one's, asking before discarding", () => {
  const discardOrStage = [
    { operation: "discard", label: "Discard Mode Change", confirmation: "Confirm discard?" },
    { operation: "stage", label: "Stage Mode Change" },
  ];

  expect(modeActions).toStrictEqual({
    modified: discardOrStage,
    untracked: discardOrStage,
    staged: [{ operation: "unstage", label: "Unstage Mode Change" }],
  });
});

test("an armed button asks for confirmation, and otherwise says what it does", () => {
  const discard = {
    operation: "discard",
    label: "Discard",
    confirmation: "Confirm discard?",
  } as const;

  expect(buttonText(discard, false)).toBe("Discard");
  expect(buttonText(discard, true)).toBe("Confirm discard?");
  expect(buttonText({ operation: "stage", label: "Stage" }, true)).toBe("Stage");
});

test.each<[Action, boolean, boolean, ButtonLook]>([
  [
    { operation: "discard", label: "Discard", confirmation: "Confirm discard?" },
    true,
    true,
    "armed",
  ],
  [
    { operation: "discard", label: "Discard", confirmation: "Confirm discard?" },
    true,
    false,
    "armed",
  ],
  [
    { operation: "discard", label: "Discard", confirmation: "Confirm discard?" },
    false,
    true,
    "warning",
  ],
  [
    { operation: "discard", label: "Discard", confirmation: "Confirm discard?" },
    false,
    false,
    "plain",
  ],
  [{ operation: "stage", label: "Stage" }, false, true, "hovered"],
  [{ operation: "stage", label: "Stage" }, false, false, "plain"],
])(
  "%j's button, armed %s, with the pointer over it %s, looks %s",
  (action, armed, hovered, look) => {
    expect(buttonLook(action, armed, hovered)).toBe(look);
  },
);

test.each<[TextLook, boolean, boolean, ReturnType<typeof textButtonLook>]>([
  ["plain", true, true, "warning"],
  ["plain", true, false, "plain"],
  ["plain", false, true, "plain"],
  ["armed", true, true, "armed"],
  ["armed", true, false, "armed"],
  ["primary", false, true, "primary"],
])(
  "a %s text button that asks for confirmation %s, with the pointer over it %s, looks %s",
  (look, confirms, hovered, shown) => {
    expect(textButtonLook(look, confirms, hovered)).toBe(shown);
  },
);

test("names a sidebar button by what it does to its file, if it acts on one, until it's armed", () => {
  const discard = {
    operation: "discard",
    label: "Discard",
    confirmation: "Confirm discard?",
  } as const;

  expect(sidebarButtonName(discard, false, "src/a.ts")).toBe("Discard src/a.ts");
  expect(sidebarButtonName(discard, true, "src/a.ts")).toBe("Confirm discard?");
  expect(sidebarButtonName({ ...discard, label: "Discard All" }, false)).toBe("Discard All");
  expect(sidebarButtonName({ ...discard, label: "Discard All" }, true)).toBe("Confirm discard?");
});

test("names each of a hunk's lines by the hunk's index and its own", () => {
  const line = { kind: "added" as const, text: "a", newline: true, runs: [] };

  expect(hunkLines([line, line, line], 2)).toStrictEqual([
    { hunk: 2, line: 0 },
    { hunk: 2, line: 1 },
    { hunk: 2, line: 2 },
  ]);
});
