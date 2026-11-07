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

// The places that are text fields, whose keys give commands though they're typed into one.
const typedIn: ReadonlySet<Place> = new Set<Place>(["filter", "find"]);

// Whether the element takes text typed in it, as a text field does.
export function takesText(element: KeyTarget | null): boolean {
  return element?.isContentEditable === true || textFields.has(element?.tagName);
}

// Whether the key, pressed with Cmd or Ctrl, types nothing in a text field.
function typesNothing({ ctrlKey, metaKey }: KeyEvent): boolean {
  return ctrlKey || metaKey;
}

// What the key pressed gives in the place, on a Mac or another computer: its command there, or
// "held" for a key held down whose command runs only once, which runs nothing more. Keys typed into
// a text field give commands only in the filter and the find bar, but for those with Cmd or Ctrl,
// which type nothing, and one something inside the element handled gives none.
export function heard<In extends Place>(
  place: In,
  event: KeyEvent,
  mac: boolean,
): CommandIn<In> | "held" | undefined {
  const typed = !typedIn.has(place) && takesText(event.target) && !typesNothing(event);
  const command = event.defaultPrevented || typed ? undefined : commandOf(place, event, mac);

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
