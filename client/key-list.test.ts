import { expect, test } from "vitest";

import { keys } from "../test/keys";
import { keyList, keysText } from "./key-list";

const lines = keyList.flatMap((section) => section.lines);

test("the list has each of the panel's keys on one line, of the place it gives its command in", () => {
  const listed = lines.flatMap(({ place, commands }) =>
    commands.map((command) => `${place} ${command}`),
  );

  expect(listed.toSorted()).toStrictEqual(
    [...new Set(keys.map(([place, , command]) => `${place} ${command}`))].toSorted(),
  );
});

test("each line has its commands' keys, each in turn", () => {
  const [anywhere, fileList, heading] = keyList;

  expect(anywhere?.lines.map((line) => keysText(line, true))).toStrictEqual([
    "/",
    "⌘F",
    "⌘G  ⇧⌘G",
    "Esc",
  ]);
  expect(anywhere?.lines.map((line) => keysText(line, false))).toStrictEqual([
    "/",
    "Ctrl+F",
    "F3  Shift+F3",
    "Esc",
  ]);
  expect(fileList?.lines.map((line) => keysText(line, false))).toStrictEqual([
    "↓  ↑",
    "Alt+↓  Alt+↑",
    "Shift+↓  Shift+↑",
    "→",
    "Shift+Enter",
    "Shift+Backspace",
    "Menu  Shift+F10",
    "Esc",
  ]);
  expect(heading?.lines.map((line) => keysText(line, true))).toStrictEqual([
    "↓  ↑",
    "⌥↓  ⌥↑",
    "←",
    "→",
    "⇧↩",
    "⇧⌫",
  ]);
});

test("the find bar's keys are listed as they are on a Mac, and elsewhere", () => {
  const findBar = keyList.find(({ title }) => title === "Keys in the find bar");

  expect(findBar?.lines.map((line) => keysText(line, true))).toStrictEqual(["↩  ⇧↩", "⌥C", "Esc"]);
  expect(findBar?.lines.map((line) => keysText(line, false))).toStrictEqual([
    "Enter  F3  Shift+Enter  Shift+F3",
    "Alt+C",
    "Esc",
  ]);
});

// The text the list shows: each section's title, and what each line's keys do.
function texts(): string[] {
  return keyList.flatMap(({ title, lines: shown }) => [title, ...shown.map(({ does }) => does)]);
}

// What the sections that say anything of all their keys say.
function infos(): string[] {
  return keyList.flatMap(({ info }) => (info === undefined ? [] : [info]));
}

test("each section has a title, and each line says what its keys do", () => {
  expect(texts().filter((text) => text.trim() === "")).toStrictEqual([]);
});

test("the sections of keys that stage and discard parts of files say what they do in STAGED", () => {
  expect(infos()).toStrictEqual([
    expect.stringContaining("STAGED"),
    expect.stringContaining("STAGED"),
  ]);
});
