import { commandOf, isHeld } from "./keymap";
import type { CommandIn, KeyPress, Place } from "./keymap";

// An element on the page, which may take text typed in it.
interface KeyTarget {
  readonly tagName?: string;
  readonly isContentEditable?: boolean;
}

// A key's event, as the element it's pressed in hears it.
export interface KeyEvent extends Readonly<KeyPress> {
  readonly target: KeyTarget | null;
  // Whether something inside the element handled it.
  readonly defaultPrevented: boolean;
}

// What takes text typed in it.
const textFields = new Set<string | undefined>(["INPUT", "TEXTAREA", "SELECT"]);

// Whether the element takes text typed in it, as a text field does.
export function takesText(element: KeyTarget | null): boolean {
  return element?.isContentEditable === true || textFields.has(element?.tagName);
}

// What the key pressed gives in the place: its command there, or "held" for a key held down whose
// command runs only once, which runs nothing more. Keys typed into a text field give commands only
// in the filter, and one something inside the element handled gives none.
export function heard<In extends Place>(
  place: In,
  event: KeyEvent,
): CommandIn<In> | "held" | undefined {
  const command =
    event.defaultPrevented || (place !== "filter" && takesText(event.target))
      ? undefined
      : commandOf(place, event);

  return isHeld(command, event) ? "held" : command;
}

// Whether the key is handled, so that nothing else on the page does anything with it: held down,
// for a command that runs only once, or giving a command that `run` says it did something with.
export function handled<Given>(
  command: Given | "held" | undefined,
  run: (command: Given) => boolean,
): boolean {
  if (command === undefined) {
    return false;
  }

  return command === "held" || run(command);
}
