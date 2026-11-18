import * as fc from "fast-check";
import { expect, test } from "vitest";

import { keys } from "../test/keys";
import { fileActions, groupActions, hunkActions, lineActions, modeActions } from "./actions";
import type { GroupName } from "./groups";
import { hintsIn } from "./key-hints";
import type { Hint } from "./key-hints";
import { chordText } from "./keymap";

// Each hint as the strip shows it: its keys, and what they do.
function said(hints: readonly Hint[]): string[] {
  return hints.map(({ keys: written, does }) => `${written}: ${does}`);
}

// What every place but the filter and the find bar ends its hints with.
const anywhere = ["/: Filter", "Ctrl+F: Find"];

// The keys that move focus from a bar.
const fromBar = ["↓ ↑: Move", "Alt+↓ Alt+↑: File", "←: File list", ...anywhere];

const group = fc.constantFrom<GroupName>("modified", "untracked", "staged");

test.each<[GroupName, string[]]>([
  ["modified", ["Enter: Stage", "Backspace: Discard"]],
  ["untracked", ["Enter: Stage", "Backspace: Delete"]],
  ["staged", ["Enter: Unstage"]],
])(
  "a %s file's row has the keys of its actions, Enter's first, and then those that move focus",
  (name, acting) => {
    expect(said(hintsIn.row(fileActions[name], false))).toStrictEqual([
      ...acting,
      "↓ ↑: Move",
      "→: Diff",
      "Shift+↓ Shift+↑: Select",
      "Alt+↓ Alt+↑: Group",
      ...anywhere,
    ]);
  },
);

test("an action Enter runs is hinted before one Backspace runs, whichever its buttons have first, and a row without actions has only the keys that move focus", () => {
  const stage = { operation: "stage", label: "Stage Selected" } as const;
  const discard = { operation: "discard", label: "Discard Selected" } as const;

  expect(said(hintsIn.row([stage, discard], true)).slice(0, 2)).toStrictEqual([
    "↩: Stage Selected",
    "⌫: Discard Selected",
  ]);
  expect(said(hintsIn.row([discard, stage], true)).slice(0, 2)).toStrictEqual([
    "↩: Stage Selected",
    "⌫: Discard Selected",
  ]);
  expect(said(hintsIn.row([], true))[0]).toBe("↓ ↑: Move");
});

test("a group's heading has Enter, which opens it, its actions' keys with Shift while it has any, and ← and → as they do expanded or collapsed", () => {
  expect(
    said(hintsIn.heading({ file: groupActions.modified, expanded: true }, false)),
  ).toStrictEqual([
    "Enter: Open",
    "Shift+Enter: Stage All",
    "Shift+Backspace: Discard All",
    "←: Collapse",
    "→: Diff",
    "↓ ↑: Move",
    "Alt+↓ Alt+↑: Group",
    ...anywhere,
  ]);
  expect(said(hintsIn.heading({ file: undefined, expanded: false }, true))).toStrictEqual([
    "↩: Open",
    "→: Expand",
    "↓ ↑: Move",
    "⌥↓ ⌥↑: Group",
    "/: Filter",
    "⌘F: Find",
  ]);
});

test("the filter has the first of the keys that move to the first file, and Escape, which clears it, or once it's empty moves back to the file list", () => {
  expect(said(hintsIn.filterInput(false, false))).toStrictEqual([
    "↓: First file",
    "Esc: Clear",
    "Ctrl+F: Find",
  ]);
  expect(said(hintsIn.filterInput(true, false))).toStrictEqual([
    "↓: First file",
    "Esc: File list",
    "Ctrl+F: Find",
  ]);
});

test("a file's bar has its actions' keys, once its diff is read, and E while it's collapsed", () => {
  expect(
    said(hintsIn.fileBar({ part: fileActions.untracked, collapsed: true }, false)),
  ).toStrictEqual(["Enter: Stage", "Backspace: Delete", "E: Show diff", ...fromBar]);
  expect(said(hintsIn.fileBar({ part: undefined, collapsed: false }, false))).toStrictEqual(
    fromBar,
  );
});

test("a mode change's bar has its actions' keys, and its file's with Shift, named as the file's", () => {
  expect(
    said(hintsIn.modeBar({ part: modeActions.staged, file: fileActions.staged }, false)),
  ).toStrictEqual(["Enter: Unstage Mode Change", "Shift+Enter: Unstage File", ...fromBar]);
});

test("a hunk's bar has its actions' keys, its file's with Shift, and those that select its lines and show more of the file", () => {
  expect(
    said(hintsIn.hunk("modified", { selected: false, sideBySide: true }, false)),
  ).toStrictEqual([
    "Enter: Stage Hunk",
    "Backspace: Discard Hunk",
    "Shift+Enter: Stage File",
    "Shift+Backspace: Discard File",
    "→: Lines",
    "E: Lines above",
    "Shift+E: Entire file",
    ...fromBar,
  ]);
});

test("a hunk's selected lines have their actions' keys, those that move and widen the selection, and ← and → only side by side", () => {
  const inline = said(hintsIn.hunk("untracked", { selected: true, sideBySide: false }, false));

  expect(inline).toStrictEqual([
    "Enter: Stage Lines",
    "Backspace: Discard Lines",
    "Shift+↓ Shift+↑: Select",
    "↓ ↑: Move",
    "Esc: Hunk",
    "Shift+Enter: Stage File",
    "Shift+Backspace: Delete File",
    "E: Lines above",
    "Shift+E: Entire file",
    ...anywhere,
  ]);
  expect(
    said(hintsIn.hunk("untracked", { selected: true, sideBySide: true }, false)),
  ).toStrictEqual([...inline.slice(0, 4), "← →: Side", ...inline.slice(4)]);
});

test("a hunk's hints are its bar's, or its selected lines', of its file's group's actions", () => {
  fc.assert(
    fc.property(group, fc.boolean(), fc.boolean(), (name, sideBySide, mac) => {
      const acted = { part: hunkActions[name], file: fileActions[name] };

      expect(hintsIn.hunk(name, { selected: false, sideBySide }, mac)).toStrictEqual(
        hintsIn.hunkBar(acted, mac),
      );
      expect(hintsIn.hunk(name, { selected: true, sideBySide }, mac)).toStrictEqual(
        hintsIn.lines({ ...acted, part: lineActions[name], sideBySide }, mac),
      );
    }),
  );
});

test("the find bar has its own keys, and nowhere in the panel, the first arrow and the keys that work anywhere", () => {
  expect(said(hintsIn.findBar(true))).toStrictEqual([
    "↩: Next",
    "⇧↩: Previous",
    "⌥C: Match case",
    "Esc: Close",
  ]);
  expect(said(hintsIn.findBar(false))[0]).toBe("Enter: Next");
  expect(said(hintsIn.nowhere(false))).toStrictEqual(["↓: File list", ...anywhere]);
});

// Every hint each place shows on the computer, whatever its file's group.
function everyHint(name: GroupName, mac: boolean): Hint[] {
  const acted = { part: hunkActions[name], file: fileActions[name] };

  return [
    ...hintsIn.row(fileActions[name], mac),
    ...hintsIn.heading({ file: groupActions[name], expanded: true }, mac),
    ...hintsIn.heading({ file: groupActions[name], expanded: false }, mac),
    ...hintsIn.filterInput(true, mac),
    ...hintsIn.fileBar({ part: fileActions[name], collapsed: true }, mac),
    ...hintsIn.modeBar({ ...acted, part: modeActions[name] }, mac),
    ...hintsIn.hunk(name, { selected: false, sideBySide: true }, mac),
    ...hintsIn.hunk(name, { selected: true, sideBySide: true }, mac),
    ...hintsIn.findBar(mac),
    ...hintsIn.nowhere(mac),
  ];
}

// How each of the keymap's keys is written on the computer, a Mac or another.
function writtenOn(mac: boolean): Set<string> {
  return new Set(
    keys
      .filter(([, { mac: only }]) => only === undefined || only === mac)
      .map(([, chord]) => chordText(chord, mac)),
  );
}

test("every key a hint shows is one of the keymap's, as it's written on the computer, and every hint says what its keys do", () => {
  fc.assert(
    fc.property(group, fc.boolean(), (name, mac) => {
      const written = writtenOn(mac);

      for (const { keys: shown, does } of everyHint(name, mac)) {
        expect(shown.split(" ").filter((key) => !written.has(key))).toStrictEqual([]);
        expect(does.trim()).not.toBe("");
      }
    }),
  );
});
