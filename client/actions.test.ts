import { expect, test } from "vitest";

import {
  buttonText,
  fileActions,
  groupActions,
  hunkActions,
  hunkLines,
  lineActions,
  sidebarButtonName,
} from "./actions";

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

test("offers discarding and staging a modified or untracked file's selected lines, and unstaging a staged one's, asking before discarding", () => {
  const discardOrStage = [
    { operation: "discard", label: "Discard Lines", confirmation: "Confirm discard?" },
    { operation: "stage", label: "Stage Lines" },
  ];

  expect(lineActions).toStrictEqual({
    modified: discardOrStage,
    untracked: discardOrStage,
    staged: [{ operation: "unstage", label: "Unstage Lines" }],
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
  const line = { kind: "added", text: "a", newline: true } as const;

  expect(hunkLines([line, line, line], 2)).toStrictEqual([
    { hunk: 2, line: 0 },
    { hunk: 2, line: 1 },
    { hunk: 2, line: 2 },
  ]);
});
