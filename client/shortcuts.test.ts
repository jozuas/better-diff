import * as fc from "fast-check";
import { expect, test } from "vitest";

import { places } from "../test/keys";
import { fileActions, hunkActions, lineActions, modeActions } from "./actions";
import type { Action } from "./actions";
import type { Target } from "./apply";
import type { GroupName } from "./groups";
import type { Place } from "./keymap";
import { buttonShortcut, nameTip, runShortcut, shortcutOf, shortcutText } from "./shortcuts";
import type { ActionCommand, Bar, Level } from "./shortcuts";

function onPartRun(): void {}

function onFileRun(): void {}

// The bar of a file's first hunk, in its diff of version 1, and the file's bar.
function barsOf(group: GroupName) {
  const file = { group, path: "a" };

  return {
    part: {
      actions: hunkActions[group],
      bar: "1:hunk 0",
      target: { file, version: "1", lines: [{ hunk: 0, line: 0 }] },
      onRun: onPartRun,
    },
    file: {
      actions: fileActions[group],
      bar: "1:file",
      target: { file, version: "1" },
      onRun: onFileRun,
    },
  } satisfies Record<Level, Bar>;
}

const groupNames: GroupName[] = ["modified", "untracked", "staged"];

// What the command does among the bars: whether it's a shortcut there, and the button it presses,
// with what the press runs, if any.
function pressedBy(command: ActionCommand, bars: Partial<Record<Level, Bar | undefined>>) {
  const presses: unknown[] = [];

  const heard = runShortcut(command, bars, {
    press: (button, action, target, onRun) => {
      presses.push({ button, action, target, onRun });
    },
  });

  return { heard, presses };
}

// A press of the button, which runs the action on the target, calling `onRun` just before.
function pressOf(
  button: string,
  action: Action | undefined,
  target: Target,
  onRun: (() => void) | undefined,
) {
  return { heard: true, presses: [{ button, action, target, onRun }] };
}

test.each<Place>(["bar", "lines"])(
  "in a %s, stages a part of a file with Enter, and Shift+Enter all of it, and Backspace and Shift+Backspace discard them",
  (place) => {
    expect(shortcutOf({ operation: "stage" }, "part", place, false)).toStrictEqual({
      key: "Enter",
    });
    expect(shortcutOf({ operation: "stage" }, "file", place, false)).toStrictEqual({
      key: "Enter",
      shift: true,
    });
    expect(shortcutOf({ operation: "discard" }, "part", place, false)).toStrictEqual({
      key: "Backspace",
    });
    expect(shortcutOf({ operation: "discard" }, "file", place, false)).toStrictEqual({
      key: "Backspace",
      shift: true,
    });
  },
);

test("unstages with Enter too, as it moves the change to the other side, which is the key a button that unstages teaches", () => {
  expect(shortcutOf({ operation: "unstage" }, "part", "bar", false)).toStrictEqual({
    key: "Enter",
  });
  expect(shortcutOf({ operation: "unstage" }, "file", "bar", false)).toStrictEqual({
    key: "Enter",
    shift: true,
  });
});

test("in a row or a group's heading, all of a file has keys, but a part of one has none", () => {
  expect(shortcutOf({ operation: "stage" }, "file", "row", false)).toStrictEqual({
    key: "Enter",
    shift: true,
  });
  expect(shortcutOf({ operation: "discard" }, "file", "heading", false)).toStrictEqual({
    key: "Backspace",
    shift: true,
  });
  expect(shortcutOf({ operation: "stage" }, "part", "row", false)).toBeUndefined();
  expect(shortcutOf({ operation: "discard" }, "part", "heading", false)).toBeUndefined();
});

test("in a modified or untracked file's hunk's bar, Enter stages the hunk and Backspace discards it, and Shift+Enter and Shift+Backspace stage and discard the file", () => {
  for (const group of ["modified", "untracked"] as const) {
    const bars = barsOf(group);
    const [discardHunk, stageHunk] = hunkActions[group];
    const [discardFile, stageFile] = fileActions[group];

    expect(pressedBy("stage", bars)).toStrictEqual(
      pressOf("1:hunk 0:stage", stageHunk, bars.part.target, onPartRun),
    );
    expect(pressedBy("discard", bars)).toStrictEqual(
      pressOf("1:hunk 0:discard", discardHunk, bars.part.target, onPartRun),
    );
    expect(pressedBy("stageFile", bars)).toStrictEqual(
      pressOf("1:file:stage", stageFile, bars.file.target, onFileRun),
    );
    expect(pressedBy("discardFile", bars)).toStrictEqual(
      pressOf("1:file:discard", discardFile, bars.file.target, onFileRun),
    );
  }
});

test("in a staged file's hunk's bar, Enter and Backspace unstage the hunk, and Shift+Enter and Shift+Backspace the file", () => {
  const bars = barsOf("staged");
  const [unstageHunk] = hunkActions.staged;
  const [unstageFile] = fileActions.staged;

  for (const command of ["stage", "discard"] as const) {
    expect(pressedBy(command, bars)).toStrictEqual(
      pressOf("1:hunk 0:unstage", unstageHunk, bars.part.target, onPartRun),
    );
  }

  for (const command of ["stageFile", "discardFile"] as const) {
    expect(pressedBy(command, bars)).toStrictEqual(
      pressOf("1:file:unstage", unstageFile, bars.file.target, onFileRun),
    );
  }
});

test("every bar's actions have a key at each level, with focus in the bar or on lines selected, in every group", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...groupNames),
      fc.constantFrom(fileActions, hunkActions, lineActions, modeActions),
      fc.constantFrom<Level>("part", "file"),
      fc.constantFrom<Place>("bar", "lines"),
      (group, actions, level, place) => {
        for (const action of actions[group]) {
          expect(shortcutOf(action, level, place, false)).toBeDefined();
        }
      },
    ),
  );
});

test.each<[ActionCommand, string, Partial<Record<Level, Bar>>]>([
  ["stage", "no bar", {}],
  ["discard", "no bar", {}],
  ["stageFile", "no bar", {}],
  ["discardFile", "no bar", {}],
  ["stage", "only a file's bar", { file: barsOf("modified").file }],
  ["discard", "only a file's bar", { file: barsOf("staged").file }],
  ["stageFile", "only a hunk's bar", { part: barsOf("modified").part }],
  ["discardFile", "only a hunk's bar", { part: barsOf("untracked").part }],
])("%s is no shortcut in a place with %s, none at its level", (command, _, bars) => {
  expect(pressedBy(command, bars)).toStrictEqual({ heard: false, presses: [] });
});

test("a command runs nothing on a bar without an action it runs, though it's the bar's", () => {
  const only: Action[] = [{ operation: "discard", label: "Discard" }];
  const bar = { actions: only, bar: "b", target: { group: "modified", paths: [] } } as const;

  expect(pressedBy("stage", { part: bar })).toStrictEqual({ heard: true, presses: [] });
});

test("writes a shortcut in a Mac's symbols on a Mac, in words elsewhere, and nothing for none", () => {
  expect(shortcutText({ key: "Enter", shift: true }, true)).toBe("⇧↩");
  expect(shortcutText({ key: "Backspace" }, false)).toBe("Backspace");
  expect(shortcutText(undefined, true)).toBeUndefined();
});

const operations = fc.constantFrom<Action["operation"]>("stage", "unstage", "discard");

// The levels of the keys that run actions in each place: a part of a file and all of it in a bar
// and on lines selected, all of a file in the file list, and none elsewhere.
const levelsIn: Partial<Record<Place, readonly Level[]>> = {
  bar: ["part", "file"],
  lines: ["part", "file"],
  row: ["file"],
  heading: ["file"],
};

// How the key that runs each operation at each level is written, on a Mac and elsewhere: Enter
// stages and unstages, and Backspace discards, on their own on a part of a file, and with Shift on
// all of it.
const written: Record<Action["operation"], Record<Level, readonly [string, string]>> = {
  stage: { part: ["↩", "Enter"], file: ["⇧↩", "Shift+Enter"] },
  unstage: { part: ["↩", "Enter"], file: ["⇧↩", "Shift+Enter"] },
  discard: { part: ["⌫", "Backspace"], file: ["⇧⌫", "Shift+Backspace"] },
};

// How the key that runs the operation at the level with focus in the place is written, if it has
// one there.
function writtenIn(
  operation: Action["operation"],
  level: Level,
  place: Place,
  mac: boolean,
): string | undefined {
  if (levelsIn[place]?.includes(level) !== true) {
    return undefined;
  }

  const [onMac, elsewhere] = written[operation][level];

  return mac ? onMac : elsewhere;
}

test("once the pointer rests on a button, it teaches the key that runs its action at its level where focus is, and nothing without a level", () => {
  fc.assert(
    fc.property(
      operations,
      fc.constantFrom<Level>("part", "file"),
      fc.constantFrom(...places),
      fc.boolean(),
      (operation, level, place, mac) => {
        expect(buttonShortcut({ operation }, level, place, mac)).toBe(
          writtenIn(operation, level, place, mac),
        );
        expect(buttonShortcut({ operation }, undefined, place, mac)).toBeUndefined();
      },
    ),
  );
});

test("a button that shows only an icon is named above it, with its key after its name, if it has one", () => {
  expect(nameTip("Stage Lines", "\u21A9")).toBe("Stage Lines  \u21A9");
  expect(nameTip("Comment")).toBe("Comment");
});
