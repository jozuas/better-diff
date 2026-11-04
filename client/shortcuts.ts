import { buttonOf } from "./actions";
import type { Action } from "./actions";
import type { Target } from "./apply";
import type { Keys } from "./shift";

// A key pressed, as its event has it: one held down is pressed again and again.
export interface KeyPress extends Keys {
  repeat: boolean;
}

// What an action acts on: a hunk, or all of its file.
export type Level = "hunk" | "file";

// The key that runs an action, Enter to stage and Backspace to discard or unstage, on its own for
// a hunk and with Shift for a file.
export interface Shortcut {
  key: "Enter" | "Backspace";
  shift: boolean;
}

export function shortcutOf({ operation }: Pick<Action, "operation">, level: Level): Shortcut {
  return { key: operation === "stage" ? "Enter" : "Backspace", shift: level === "file" };
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

// A button a shortcut presses, as a click on it would.
export interface Pressed {
  button: string;
  action: Action;
  target: Target;
  onRun: (() => void) | undefined;
}

// What the key, pressed with focus in a bar that has the bars at each level, presses: the button
// whose action's shortcut it is. None while it's held down, as holding Backspace would confirm a
// discard, nor where no action has that shortcut, as Shift+Enter on a staged file. Undefined for a
// key that's no shortcut there, or pressed with other modifiers, which the page hears as it would:
// Enter on its own presses the button with focus, which is a hunk's Stage Hunk once keys move
// focus to the hunk.
export function shortcutPress(
  { key, shiftKey, altKey, ctrlKey, metaKey, repeat }: KeyPress,
  bars: Partial<Record<Level, Bar | undefined>>,
): Pressed | "none" | undefined {
  const level = shiftKey ? "file" : "hunk";
  const shown = bars[level];

  if (
    shown === undefined ||
    altKey ||
    ctrlKey ||
    metaKey ||
    (key === "Enter" && !shiftKey) ||
    (key !== "Enter" && key !== "Backspace")
  ) {
    return undefined;
  }

  const action = shown.actions.find((each) => shortcutOf(each, level).key === key);

  return repeat || action === undefined
    ? "none"
    : { button: buttonOf(shown.bar, action), action, target: shown.target, onRun: shown.onRun };
}

// How the shortcut is written: in a Mac's symbols on a Mac, ⇧⌫, and in words elsewhere,
// Shift+Backspace.
export function shortcutText({ key, shift }: Shortcut, mac: boolean): string {
  if (mac) {
    return `${shift ? "⇧" : ""}${key === "Enter" ? "↩" : "⌫"}`;
  }

  return `${shift ? "Shift+" : ""}${key}`;
}
