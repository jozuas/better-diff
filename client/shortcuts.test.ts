import * as fc from "fast-check";
import { expect, test } from "vitest";

import { fileActions, hunkActions } from "./actions";
import type { GroupName } from "./groups";
import { shortcutOf, shortcutPress, shortcutText } from "./shortcuts";
import type { Bar, KeyPress, Level } from "./shortcuts";

const plain = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, repeat: false };

function pressed(key: string, shiftKey = false): KeyPress {
  return { ...plain, key, shiftKey };
}

function onHunkRun(): void {}

function onFileRun(): void {}

// The bar of a file's first hunk, in its diff of version 1, and the file's bar.
function barsOf(group: GroupName) {
  const file = { group, path: "a" };

  return {
    hunk: {
      actions: hunkActions[group],
      bar: "1:hunk 0",
      target: { file, version: "1", lines: [{ hunk: 0, line: 0 }] },
      onRun: onHunkRun,
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

test("stages with Enter on a hunk, and with Shift+Enter on a file", () => {
  expect(shortcutOf({ operation: "stage" }, "hunk")).toStrictEqual({ key: "Enter", shift: false });
  expect(shortcutOf({ operation: "stage" }, "file")).toStrictEqual({ key: "Enter", shift: true });
});

test("discards or unstages with Backspace on a hunk, and with Shift+Backspace on a file", () => {
  for (const operation of ["discard", "unstage"] as const) {
    expect(shortcutOf({ operation }, "hunk")).toStrictEqual({ key: "Backspace", shift: false });
    expect(shortcutOf({ operation }, "file")).toStrictEqual({ key: "Backspace", shift: true });
  }
});

test("in a modified or untracked file's hunk's bar, Backspace discards the hunk, Shift+Enter stages the file and Shift+Backspace discards it", () => {
  for (const group of ["modified", "untracked"] as const) {
    const bars = barsOf(group);
    const [discardHunk] = hunkActions[group];
    const [discardFile, stageFile] = fileActions[group];

    expect(shortcutPress(pressed("Backspace"), bars)).toStrictEqual({
      button: "1:hunk 0:discard",
      action: discardHunk,
      target: bars.hunk.target,
      onRun: onHunkRun,
    });
    expect(shortcutPress(pressed("Enter", true), bars)).toStrictEqual({
      button: "1:file:stage",
      action: stageFile,
      target: bars.file.target,
      onRun: onFileRun,
    });
    expect(shortcutPress(pressed("Backspace", true), bars)).toStrictEqual({
      button: "1:file:discard",
      action: discardFile,
      target: bars.file.target,
      onRun: onFileRun,
    });
  }
});

test("in a staged file's hunk's bar, Backspace unstages the hunk and Shift+Backspace the file, and Shift+Enter presses nothing", () => {
  const bars = barsOf("staged");
  const [unstageHunk] = hunkActions.staged;
  const [unstageFile] = fileActions.staged;

  expect(shortcutPress(pressed("Backspace"), bars)).toStrictEqual({
    button: "1:hunk 0:unstage",
    action: unstageHunk,
    target: bars.hunk.target,
    onRun: onHunkRun,
  });
  expect(shortcutPress(pressed("Backspace", true), bars)).toStrictEqual({
    button: "1:file:unstage",
    action: unstageFile,
    target: bars.file.target,
    onRun: onFileRun,
  });
  expect(shortcutPress(pressed("Enter", true), bars)).toBe("none");
});

test("leaves Enter on its own to the button with focus, held down or not", () => {
  fc.assert(
    fc.property(fc.constantFrom(...groupNames), fc.boolean(), (group, repeat) => {
      expect(shortcutPress({ ...pressed("Enter"), repeat }, barsOf(group))).toBeUndefined();
    }),
  );
});

test("in a file's bar, Shift+Enter and Shift+Backspace press its buttons, and Backspace on its own nothing", () => {
  const { file } = barsOf("modified");

  expect(shortcutPress(pressed("Enter", true), { file })).toMatchObject({
    button: "1:file:stage",
  });
  expect(shortcutPress(pressed("Backspace", true), { file })).toMatchObject({
    button: "1:file:discard",
  });
  expect(shortcutPress(pressed("Backspace"), { file })).toBeUndefined();
});

test("a shortcut held down presses nothing again, though it's still the bar's", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...groupNames),
      fc.constantFrom(pressed("Backspace"), pressed("Backspace", true), pressed("Enter", true)),
      (group, press) => {
        expect(shortcutPress({ ...press, repeat: true }, barsOf(group))).toBe("none");
      },
    ),
  );
});

test("another key is no shortcut", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...groupNames),
      fc.oneof(
        fc.string({ unit: "binary" }).filter((key) => !["Enter", "Backspace"].includes(key)),
        fc.constantFrom("Delete", "enter", "backspace", " ", "ArrowDown"),
      ),
      fc.boolean(),
      fc.boolean(),
      (group, key, shiftKey, repeat) => {
        expect(shortcutPress({ ...pressed(key, shiftKey), repeat }, barsOf(group))).toBeUndefined();
      },
    ),
  );
});

test("a shortcut's key pressed with Alt, Ctrl or Cmd is no shortcut", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...groupNames),
      fc.constantFrom("Enter", "Backspace"),
      fc.boolean(),
      fc.constantFrom({ altKey: true }, { ctrlKey: true }, { metaKey: true }),
      (group, key, shiftKey, modifier) => {
        expect(
          shortcutPress({ ...pressed(key, shiftKey), ...modifier }, barsOf(group)),
        ).toBeUndefined();
      },
    ),
  );
});

test("writes a shortcut in a Mac's symbols on a Mac", () => {
  expect(shortcutText({ key: "Enter", shift: false }, true)).toBe("↩");
  expect(shortcutText({ key: "Backspace", shift: false }, true)).toBe("⌫");
  expect(shortcutText({ key: "Enter", shift: true }, true)).toBe("⇧↩");
  expect(shortcutText({ key: "Backspace", shift: true }, true)).toBe("⇧⌫");
});

test("writes a shortcut in words elsewhere", () => {
  expect(shortcutText({ key: "Enter", shift: false }, false)).toBe("Enter");
  expect(shortcutText({ key: "Backspace", shift: false }, false)).toBe("Backspace");
  expect(shortcutText({ key: "Enter", shift: true }, false)).toBe("Shift+Enter");
  expect(shortcutText({ key: "Backspace", shift: true }, false)).toBe("Shift+Backspace");
});
