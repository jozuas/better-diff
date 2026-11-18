import { createContext } from "react";

import { fileActions, hunkActions, lineActions } from "./actions";
import type { Action } from "./actions";
import type { GroupName } from "./groups";
import { chordsOf, chordText } from "./keymap";
import type { Command, CommandIn, Place } from "./keymap";
import { actionCommand } from "./shortcuts";
import type { Level } from "./shortcuts";

// Keys, as they're written, and what they do there, in a word or two.
export interface Hint {
  keys: string;
  does: string;
}

type Actions = readonly Pick<Action, "operation" | "label">[];

// One hint, of what the first key of each of the commands does in the place, if any has a key
// there.
function hinted(place: Place, commands: readonly Command[], does: string, mac: boolean): Hint[] {
  const keys = commands
    .flatMap((command) => chordsOf(place, command, mac).slice(0, 1))
    .map((chord) => chordText(chord, mac));

  return keys.slice(0, 1).map(() => ({ keys: keys.join(" "), does }));
}

// 1 for an action that discards, which Backspace runs, and 0 for another, which Enter does.
function discards({ operation }: Pick<Action, "operation">): number {
  return operation === "discard" ? 1 : 0;
}

// What the first key of each of the place's commands does there.
function keyed<In extends Place>(
  place: In,
  commands: readonly CommandIn<In>[],
  does: string,
  mac: boolean,
): Hint[] {
  return hinted(place, commands, does, mac);
}

// The key of each of the actions at the level in the place, as its button teaches it, Enter's
// before Backspace's, with what it acts on after its name where the name doesn't say.
function acting(
  place: Place,
  level: Level,
  actions: Actions | undefined,
  mac: boolean,
  on = "",
): Hint[] {
  return (actions ?? [])
    .toSorted((action, other) => discards(action) - discards(other))
    .flatMap((action) =>
      hinted(place, [actionCommand(action, level)], `${action.label}${on}`, mac),
    );
}

// The keys that work anywhere in the panel.
function anywhere(mac: boolean): Hint[] {
  return [...keyed("panel", ["filter"], "Filter", mac), ...keyed("panel", ["find"], "Find", mac)];
}

// What a file's bar's keys act on: its actions, once its diff is read, and whether it's collapsed.
interface FileBarKeys {
  part: Actions | undefined;
  collapsed: boolean;
}

// What a hunk's or a mode change's bar's keys act on: its actions, and its file's.
interface PartBarKeys {
  part: Actions;
  file: Actions;
}

// The keys that move focus from a bar.
function fromBar(mac: boolean): Hint[] {
  return [
    ...keyed("bar", ["down", "up"], "Move", mac),
    ...keyed("bar", ["fileDown", "fileUp"], "File", mac),
    ...keyed("bar", ["out"], "File list", mac),
    ...anywhere(mac),
  ];
}

// The keys that work with focus in each place, on a Mac or another computer, and what each does
// there: those that run its actions, as its buttons name them, with File after the name of one on
// all of a file where others act on a part of it, and then those that move focus from it.
export const hintsIn = {
  // A file's row, with its actions.
  row: (part: Actions, mac: boolean): Hint[] => [
    ...acting("row", "part", part, mac),
    ...keyed("row", ["down", "up"], "Move", mac),
    ...keyed("row", ["into"], "Diff", mac),
    ...keyed("row", ["selectDown", "selectUp"], "Select", mac),
    ...keyed("row", ["groupDown", "groupUp"], "Group", mac),
    ...anywhere(mac),
  ],
  // A group's heading, with its actions, while it has any.
  heading: (
    { file, expanded }: { file: Actions | undefined; expanded: boolean },
    mac: boolean,
  ): Hint[] => [
    { keys: chordText({ key: "Enter" }, mac), does: "Open" },
    ...acting("heading", "file", file, mac),
    ...(expanded
      ? [
          ...keyed("heading", ["collapse"], "Collapse", mac),
          ...keyed("heading", ["expand"], "Diff", mac),
        ]
      : keyed("heading", ["expand"], "Expand", mac)),
    ...keyed("heading", ["down", "up"], "Move", mac),
    ...keyed("heading", ["groupDown", "groupUp"], "Group", mac),
    ...anywhere(mac),
  ],
  // The filter, empty or not.
  filterInput: (empty: boolean, mac: boolean): Hint[] => [
    ...keyed("filter", ["first"], "First file", mac),
    ...keyed("filter", ["clear"], empty ? "File list" : "Clear", mac),
    ...keyed("panel", ["find"], "Find", mac),
  ],
  fileBar: ({ part, collapsed }: FileBarKeys, mac: boolean): Hint[] => [
    ...acting("bar", "part", part, mac),
    ...(collapsed ? keyed("bar", ["more"], "Show diff", mac) : []),
    ...fromBar(mac),
  ],
  modeBar: ({ part, file }: PartBarKeys, mac: boolean): Hint[] => [
    ...acting("bar", "part", part, mac),
    ...acting("bar", "file", file, mac, " File"),
    ...fromBar(mac),
  ],
  // A hunk's bar, or its selected lines while it has any, by its file's group.
  hunk: (
    group: GroupName,
    { selected, sideBySide }: { selected: boolean; sideBySide: boolean },
    mac: boolean,
  ): Hint[] =>
    selected
      ? hintsIn.lines({ part: lineActions[group], file: fileActions[group], sideBySide }, mac)
      : hintsIn.hunkBar({ part: hunkActions[group], file: fileActions[group] }, mac),
  hunkBar: ({ part, file }: PartBarKeys, mac: boolean): Hint[] => [
    ...acting("bar", "part", part, mac),
    ...acting("bar", "file", file, mac, " File"),
    ...keyed("bar", ["into"], "Lines", mac),
    ...keyed("bar", ["more"], "Lines above", mac),
    ...keyed("bar", ["moreFile"], "Entire file", mac),
    ...fromBar(mac),
  ],
  // A hunk's selected lines, side by side or inline.
  lines: (
    { part, file, sideBySide }: PartBarKeys & { sideBySide: boolean },
    mac: boolean,
  ): Hint[] => [
    ...acting("lines", "part", part, mac),
    ...keyed("lines", ["extendDown", "extendUp"], "Select", mac),
    ...keyed("lines", ["down", "up"], "Move", mac),
    ...(sideBySide ? keyed("lines", ["left", "right"], "Side", mac) : []),
    ...keyed("lines", ["leave"], "Hunk", mac),
    ...acting("lines", "file", file, mac, " File"),
    ...keyed("lines", ["more"], "Lines above", mac),
    ...keyed("lines", ["moreFile"], "Entire file", mac),
    ...anywhere(mac),
  ],
  findBar: (mac: boolean): Hint[] => [
    ...keyed("find", ["next"], "Next", mac),
    ...keyed("find", ["previous"], "Previous", mac),
    ...keyed("find", ["matchCase"], "Match case", mac),
    ...keyed("find", ["close"], "Close", mac),
  ],
  // Nowhere in the panel that keys act on.
  nowhere: (mac: boolean): Hint[] => [
    ...keyed("nowhere", ["open"], "File list", mac),
    ...anywhere(mac),
  ],
};

// The hints the panel shows: those of the place focus is in, by what showed them, and what hears
// them change.
export interface KeyHints {
  // Shows the hints of the owner with the id, in place of any others.
  show: (owner: string, shown: readonly Hint[]) => void;
  // Shows none, if the hints shown are those of the owner with the id.
  hide: (owner: string) => void;
  // The hints shown, the same list until they change.
  state: () => readonly Hint[];
  // Calls the listener each time the hints change, until the returned function is called.
  subscribe: (listener: () => void) => () => void;
}

const none: readonly Hint[] = [];

function written(shown: readonly Hint[]): string {
  return shown.map(({ keys, does }) => `${keys}\t${does}`).join("\n");
}

export function keyHints(): KeyHints {
  let shownBy: string | undefined;
  let shown = none;
  const listeners = new Set<() => void>();

  function tell(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    show: (owner, next) => {
      if (shownBy !== owner || written(shown) !== written(next)) {
        shownBy = owner;
        shown = next;
        tell();
      }
    },
    hide: (owner) => {
      if (shownBy === owner) {
        shownBy = undefined;
        shown = none;
        tell();
      }
    },
    state: () => shown,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// The panel's, which the places focus is in show their hints with.
export const KeyHintsContext = createContext(keyHints());
