// A key pressed, and the modifiers held, as a key's event has them.
export interface Keys {
  key: string;
  // Where the key is on the keyboard, whatever it types, as `KeyE`.
  code: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

// A key pressed, as its event has it: one held down is pressed again and again.
export interface KeyPress extends Keys {
  repeat: boolean;
}

// A key, by its event's `key`, and the modifiers pressed with it. A letter is written in lower case
// and pressed with Shift only where the chord says so, whatever Caps Lock does, and on a keyboard
// that types another script's letters, where a US keyboard has it. Another character is pressed
// with Shift or without, whichever the keyboard gives it with, as some give `/` only with Shift. A
// named key, such as Enter, is pressed with Shift only where the chord says so. `primary` keys are
// pressed with ⌘ on a Mac and Ctrl elsewhere, and `mac` ones only on a Mac, or only elsewhere.
export interface Chord {
  key: string;
  shift?: boolean;
  alt?: boolean;
  primary?: boolean;
  mac?: boolean;
}

const enter = { key: "Enter" } as const;
const backspace = { key: "Backspace" } as const;
const escape = { key: "Escape" } as const;
const down = { key: "ArrowDown" } as const;
const up = { key: "ArrowUp" } as const;
const left = { key: "ArrowLeft" } as const;
const right = { key: "ArrowRight" } as const;
const altDown = { ...down, alt: true } as const;
const altUp = { ...up, alt: true } as const;
const shiftDown = { ...down, shift: true } as const;
const shiftUp = { ...up, shift: true } as const;
const shiftEnter = { ...enter, shift: true } as const;
const shiftBackspace = { ...backspace, shift: true } as const;
const more = { key: "e" } as const;
const find = { key: "f", primary: true } as const;
const findNext = { key: "g", primary: true, mac: true } as const;
const findPrevious = { ...findNext, shift: true } as const;
const f3 = { key: "F3", mac: false } as const;
const shiftF3 = { ...f3, shift: true } as const;

// Every key the panel hears, by the place focus is in and the command it gives there. None takes
// Cmd or Ctrl, which Paseo's own shortcuts take, but the find bar's ⌘F and ⌘G, or Ctrl+F
// elsewhere, which Paseo leaves free and other apps find with. None takes `?` either, which shows
// Paseo's list of its shortcuts.
const bindings = [
  { place: "row", command: "down", chords: [down] },
  { place: "row", command: "up", chords: [up] },
  { place: "row", command: "groupDown", chords: [altDown] },
  { place: "row", command: "groupUp", chords: [altUp] },
  { place: "row", command: "selectDown", chords: [shiftDown] },
  { place: "row", command: "selectUp", chords: [shiftUp] },
  { place: "row", command: "into", chords: [right] },
  { place: "row", command: "stageFile", chords: [shiftEnter] },
  { place: "row", command: "discardFile", chords: [shiftBackspace] },
  { place: "row", command: "menu", chords: [{ key: "ContextMenu" }, { key: "F10", shift: true }] },
  { place: "row", command: "single", chords: [escape] },
  { place: "heading", command: "down", chords: [down] },
  { place: "heading", command: "up", chords: [up] },
  { place: "heading", command: "groupDown", chords: [altDown] },
  { place: "heading", command: "groupUp", chords: [altUp] },
  { place: "heading", command: "collapse", chords: [left] },
  { place: "heading", command: "expand", chords: [right] },
  { place: "heading", command: "stageFile", chords: [shiftEnter] },
  { place: "heading", command: "discardFile", chords: [shiftBackspace] },
  { place: "filter", command: "first", chords: [down, enter] },
  { place: "filter", command: "clear", chords: [escape] },
  { place: "bar", command: "down", chords: [down] },
  { place: "bar", command: "up", chords: [up] },
  { place: "bar", command: "fileDown", chords: [altDown] },
  { place: "bar", command: "fileUp", chords: [altUp] },
  { place: "bar", command: "out", chords: [left] },
  { place: "bar", command: "into", chords: [right] },
  { place: "bar", command: "stage", chords: [enter] },
  { place: "bar", command: "discard", chords: [backspace] },
  { place: "bar", command: "stageFile", chords: [shiftEnter] },
  { place: "bar", command: "discardFile", chords: [shiftBackspace] },
  { place: "bar", command: "more", chords: [more] },
  { place: "lines", command: "down", chords: [down] },
  { place: "lines", command: "up", chords: [up] },
  { place: "lines", command: "extendDown", chords: [shiftDown] },
  { place: "lines", command: "extendUp", chords: [shiftUp] },
  { place: "lines", command: "left", chords: [left] },
  { place: "lines", command: "right", chords: [right] },
  { place: "lines", command: "stage", chords: [enter] },
  { place: "lines", command: "discard", chords: [backspace] },
  { place: "lines", command: "stageFile", chords: [shiftEnter] },
  { place: "lines", command: "discardFile", chords: [shiftBackspace] },
  { place: "lines", command: "leave", chords: [escape] },
  { place: "lines", command: "more", chords: [more] },
  { place: "menu", command: "down", chords: [down] },
  { place: "menu", command: "up", chords: [up] },
  { place: "panel", command: "filter", chords: [{ key: "/" }] },
  { place: "panel", command: "find", chords: [find] },
  { place: "panel", command: "findNext", chords: [findNext, f3] },
  { place: "panel", command: "findPrevious", chords: [findPrevious, shiftF3] },
  { place: "find", command: "next", chords: [enter, f3] },
  { place: "find", command: "previous", chords: [shiftEnter, shiftF3] },
  { place: "find", command: "matchCase", chords: [{ key: "c", alt: true }] },
  { place: "find", command: "close", chords: [escape] },
  { place: "question", command: "cancel", chords: [escape] },
] as const satisfies readonly { place: string; command: string; chords: readonly Chord[] }[];

type Binding = (typeof bindings)[number];

// Where focus is: a file's row or a group's heading in the sidebar, the filter, a bar in the diff,
// or a hunk's selected lines, a file's menu, the find bar, or anywhere in the panel, and anywhere in
// it while a button asks its question, before anything in it hears the key.
export type Place = Binding["place"];

export type Command = Binding["command"];

// The commands keys give in the place.
export type CommandIn<In extends Place> = Binding extends infer Each
  ? Each extends { place: In; command: infer Given }
    ? Given
    : never
  : never;

// The commands that run once however long their key is held down, as an action does, while a move
// runs again and again: holding Backspace would confirm a discard.
const once: ReadonlySet<Command | undefined> = new Set<Command | undefined>([
  "stage",
  "discard",
  "stageFile",
  "discardFile",
  "menu",
  "more",
]);

// Whether the key types letters, none of them Latin, as a key of a Cyrillic keyboard does.
function otherScript(key: string): boolean {
  return /\p{Letter}/u.test(key) && !/[a-z]/iu.test(key);
}

// Whether the key pressed types the letter, in either case, or on a keyboard that types another
// script's letters, is where a US keyboard has it.
function typesLetter(letter: string, { key, code }: Keys): boolean {
  return otherScript(key) ? code === `Key${letter.toUpperCase()}` : key.toLowerCase() === letter;
}

// Whether the chord is one of the computer's, a Mac or another.
function isOn({ mac: only }: Chord, mac: boolean): boolean {
  return only === undefined || only === mac;
}

// Whether the key pressed, on a Mac or another computer, is the chord's: one of the computer's,
// with ⌘ on a Mac or Ctrl elsewhere where it's `primary`, and with neither Cmd nor Ctrl where it
// isn't.
function matches(chord: Chord, press: Keys, mac: boolean): boolean {
  const { key, shift = false, alt = false, primary = false } = chord;
  const primaryHeld = mac ? press.metaKey && !press.ctrlKey : press.ctrlKey && !press.metaKey;
  const neitherHeld = !press.ctrlKey && !press.metaKey;

  if (!isOn(chord, mac) || !(primary ? primaryHeld : neitherHeld) || press.altKey !== alt) {
    return false;
  }

  if (key.length > 1) {
    return press.key === key && press.shiftKey === shift;
  }

  if (/\p{Letter}/u.test(key)) {
    return typesLetter(key, press) && press.shiftKey === shift;
  }

  return press.key === key;
}

// The command the key gives in the place, on a Mac or another computer, if any: one of the place's.
export function commandOf<In extends Place>(
  place: In,
  press: Keys,
  mac: boolean,
): CommandIn<In> | undefined;
export function commandOf(place: Place, press: Keys, mac: boolean): Command | undefined {
  return bindings.find(
    (binding) =>
      binding.place === place && binding.chords.some((chord) => matches(chord, press, mac)),
  )?.command;
}

// Whether the key gives the command held down, which runs only once.
export function isHeld(command: Command | undefined, { repeat }: KeyPress): boolean {
  return repeat && once.has(command);
}

// The keys that give the command in the place, on a Mac or another computer.
export function chordsOf(place: Place, command: Command, mac: boolean): readonly Chord[] {
  const chords: readonly Chord[] =
    bindings.find((binding) => binding.place === place && binding.command === command)?.chords ??
    [];

  return chords.filter((chord) => isOn(chord, mac));
}

// The key that gives the command in the place, on a Mac or another computer, the first if more than
// one does.
export function chordOf(place: Place, command: Command, mac: boolean): Chord | undefined {
  return chordsOf(place, command, mac)[0];
}

// The names of keys, on a Mac and elsewhere, that aren't the character they type.
const names = new Map<string, readonly [string, string]>([
  ["Enter", ["↩", "Enter"]],
  ["Backspace", ["⌫", "Backspace"]],
  ["Escape", ["Esc", "Esc"]],
  ["ArrowDown", ["↓", "↓"]],
  ["ArrowUp", ["↑", "↑"]],
  ["ArrowLeft", ["←", "←"]],
  ["ArrowRight", ["→", "→"]],
  ["ContextMenu", ["Menu", "Menu"]],
]);

// How the chord is written: in a Mac's symbols on a Mac, ⌥⇧⌘↩, and in words elsewhere,
// Ctrl+Alt+Shift+Enter.
export function chordText({ key, shift, alt, primary }: Chord, mac: boolean): string {
  const [onMac, elsewhere] = names.get(key) ?? [key.toUpperCase(), key.toUpperCase()];

  if (mac) {
    return `${alt === true ? "⌥" : ""}${shift === true ? "⇧" : ""}${primary === true ? "⌘" : ""}${onMac}`;
  }

  return `${primary === true ? "Ctrl+" : ""}${alt === true ? "Alt+" : ""}${shift === true ? "Shift+" : ""}${elsewhere}`;
}
