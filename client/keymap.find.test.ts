import { expect, test } from "vitest";

import { enter } from "../test/keys";
import { chordOf, chordsOf, commandOf } from "./keymap";
import type { Command, Keys } from "./keymap";

const plain = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };

const f = { ...plain, key: "f", code: "KeyF" };
const g = { ...plain, key: "g", code: "KeyG" };
const f3 = { ...plain, key: "F3", code: "F3" };

test.each<[string, Keys, boolean, Command | undefined]>([
  ["⌘F on a Mac", { ...f, metaKey: true }, true, "find"],
  ["Ctrl+F elsewhere", { ...f, ctrlKey: true }, false, "find"],
  ["Ctrl+F on a Mac", { ...f, ctrlKey: true }, true, undefined],
  ["the Windows key and F elsewhere", { ...f, metaKey: true }, false, undefined],
  ["⌃⌘F on a Mac", { ...f, metaKey: true, ctrlKey: true }, true, undefined],
  ["F on its own on a Mac", f, true, undefined],
  ["F on its own elsewhere", f, false, undefined],
  [
    "Ctrl, the Windows key and F elsewhere",
    { ...f, ctrlKey: true, metaKey: true },
    false,
    undefined,
  ],
  ["⌘G on a Mac", { ...g, metaKey: true }, true, "findNext"],
  ["⇧⌘G on a Mac", { ...g, metaKey: true, shiftKey: true }, true, "findPrevious"],
  ["Ctrl+G elsewhere, which goes to a line in editors", { ...g, ctrlKey: true }, false, undefined],
  ["F3 elsewhere", f3, false, "findNext"],
  ["Shift+F3 elsewhere", { ...f3, shiftKey: true }, false, "findPrevious"],
  ["F3 on a Mac", f3, true, undefined],
])("%s, anywhere in the panel, gives %s", (_, press, mac, command) => {
  expect(commandOf("panel", press, mac)).toBe(command);
});

test("a command's keys are those of the computer, a Mac or another", () => {
  expect(chordsOf("panel", "findNext", true)).toStrictEqual([
    { key: "g", primary: true, mac: true },
  ]);
  expect(chordsOf("panel", "findNext", false)).toStrictEqual([{ key: "F3", mac: false }]);
  expect(chordsOf("find", "previous", true)).toStrictEqual([{ ...enter, shift: true }]);
  expect(chordOf("find", "next", false)).toStrictEqual(enter);
});
