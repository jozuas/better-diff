import { buttonOf } from "./actions";
import type { Action, Controls } from "./actions";
import type { Target } from "./apply";
import { chordOf, chordText } from "./keymap";
import type { Chord, Command, Place } from "./keymap";

// What an action acts on: a part of a file, such as a hunk, its selected lines or its mode change,
// or all of the file.
export type Level = "part" | "file";

type Operation = Action["operation"];

// The operations each key that runs actions runs: Enter moves a change to the other side, staging
// it or unstaging it, and Backspace discards it, or unstages it.
type Key = "move" | "discard";

const runs: Record<Key, readonly Operation[]> = {
  move: ["stage", "unstage"],
  discard: ["discard", "unstage"],
};

// The commands of the keys that run actions.
export type ActionCommand = Extract<Command, "stage" | "discard" | "stageFile" | "discardFile">;

// The command of each key that runs actions: on its own on a part of a file, and with Shift on all
// of it.
const commands: Record<Level, Record<Key, ActionCommand>> = {
  part: { move: "stage", discard: "discard" },
  file: { move: "stageFile", discard: "discardFile" },
};

// What runs each command: the key, and what it runs on.
const pressing: Record<ActionCommand, { level: Level; key: Key }> = {
  stage: { level: "part", key: "move" },
  discard: { level: "part", key: "discard" },
  stageFile: { level: "file", key: "move" },
  discardFile: { level: "file", key: "discard" },
};

// The key that runs the action at the level with focus in the place, which its button teaches:
// Enter's, Shift+Enter's on all of a file, but Backspace's for a discard.
export function shortcutOf(
  { operation }: Pick<Action, "operation">,
  level: Level,
  place: Place,
): Chord | undefined {
  return chordOf(place, commands[level][operation === "discard" ? "discard" : "move"]);
}

// A bar's actions, as its buttons have them.
export interface Bar {
  actions: readonly Action[];
  // Tells the bar's buttons apart from other bars'.
  bar: string;
  // What its actions act on.
  target: Target;
  // Called just before one of them runs.
  onRun?: (() => void) | undefined;
}

// A button a key presses, as a click on it would.
interface Pressed {
  button: string;
  action: Action;
  target: Target;
  onRun: (() => void) | undefined;
}

// What the command presses, given with focus in a place that has the bars at each level: the button
// of the action it runs at its level. None where no action runs it, and undefined where the place
// has no bar at its level.
function shortcutPress(
  command: ActionCommand,
  bars: Partial<Record<Level, Bar | undefined>>,
): Pressed | "none" | undefined {
  const { level, key } = pressing[command];
  const shown = bars[level];

  if (shown === undefined) {
    return undefined;
  }

  const action = shown.actions.find(({ operation }) => runs[key].includes(operation));

  return action === undefined
    ? "none"
    : { button: buttonOf(shown.bar, action), action, target: shown.target, onRun: shown.onRun };
}

// Presses the button the command presses among the bars', as a click on it would, and says whether
// the place has a bar the command runs an action of, though none ran.
export function runShortcut(
  command: ActionCommand,
  bars: Partial<Record<Level, Bar | undefined>>,
  controls: Pick<Controls, "press">,
): boolean {
  const pressed = shortcutPress(command, bars);

  if (pressed !== undefined && pressed !== "none") {
    controls.press(pressed.button, pressed.action, pressed.target, pressed.onRun);
  }

  return pressed !== undefined;
}

// How the shortcut is written, if there's one.
export function shortcutText(shortcut: Chord | undefined, mac: boolean): string | undefined {
  return shortcut === undefined ? undefined : chordText(shortcut, mac);
}

// How a button's keys are written: the shortcut that runs its action at the level, with focus in
// the place, which shows once the pointer rests on it, and while focus is on its bar itself, the
// key that presses it from there.
export interface ButtonKeys {
  pointed: string | undefined;
  keyed: string | undefined;
}

export function buttonKeys(
  action: Pick<Action, "operation">,
  { level, place, keyed }: { level: Level | undefined; place: Place; keyed: boolean },
  mac: boolean,
): ButtonKeys {
  return {
    pointed: level === undefined ? undefined : shortcutText(shortcutOf(action, level, place), mac),
    keyed: keyed ? shortcutText(shortcutOf(action, "part", place), mac) : undefined,
  };
}

// The key that shows under a button, and whether what shows it rests there: the pointer's shortcut
// while the pointer rests on the button, or else, while focus rests on its bar, the key that presses
// it from there.
export function tipOf(
  { pointed, keyed }: ButtonKeys,
  pointer: boolean,
): { shortcut: string | undefined; resting: boolean } {
  return pointer
    ? { shortcut: pointed ?? keyed, resting: true }
    : { shortcut: keyed, resting: keyed !== undefined };
}
