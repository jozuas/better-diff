import { commandOf, isHeld } from "./keymap";
import type { CommandIn, KeyPress, Place } from "./keymap";

// An element on the page, which may take text typed in it, with what it's marked with.
interface KeyTarget {
  readonly id?: string;
  readonly tagName?: string;
  readonly isContentEditable?: boolean;
  readonly dataset?: Readonly<Record<string, string | undefined>>;
}

// A key's event, as the element it's pressed in hears it.
export interface KeyEvent extends Readonly<KeyPress> {
  readonly target: KeyTarget | null;
  // Whether something inside the element handled it.
  readonly defaultPrevented: boolean;
}

const view = "view";

// What a view of the panel that scrolls is marked with, as focus on it is on nothing keys act on.
export const restMark = { rest: view };

// Whether focus is nowhere in the panel that keys act on, given whether it's on the panel itself,
// as after a click on empty space in it, or else on a view of it that scrolls.
export function atRest(target: KeyTarget | null, own: boolean): boolean {
  return own || target?.dataset?.["rest"] === view;
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
