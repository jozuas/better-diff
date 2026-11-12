import * as fc from "fast-check";
import { expect, test } from "vitest";

import { down, enter, keys, places } from "../test/keys";
import { chordOf, chordText, commandOf, isHeld } from "./keymap";
import type { Chord, Command, Keys, Place } from "./keymap";

const plain = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };

// Where a letter is on a US keyboard.
function codeOf(letter: string): string {
  return `Key${letter.toUpperCase()}`;
}

const latin = fc.constantFrom("a", "e", "w", "z");

// Letters of other scripts, as keyboards for them type: Cyrillic in either case, Greek, Hebrew, and
// a Latin letter a US keyboard doesn't type.
const otherLetter = fc.constantFrom("у", "У", "ц", "ε", "ש", "é");

// Where a key is on the keyboard: a letter's key, another's, or none, as a virtual keyboard has it.
const code = fc.oneof(
  latin.map(codeOf),
  fc.constantFrom("Slash", "Digit7", "BracketLeft", "Enter", "ArrowDown", "Escape", "F10", ""),
);

// The key pressed as the chord writes it, wherever the keyboard has it, on a Mac or elsewhere: with
// ⌘ on a Mac and Ctrl elsewhere where it takes them.
function pressOf(
  { key, shift = false, alt = false, primary = false }: Chord,
  at: string,
  mac: boolean,
): Keys {
  return {
    ...plain,
    key,
    code: at,
    shiftKey: shift,
    altKey: alt,
    metaKey: primary && mac,
    ctrlKey: primary && !mac,
  };
}

// The computers the chord is on: a Mac, others, or both.
function computersOf({ mac }: Chord): boolean[] {
  return mac === undefined ? [true, false] : [mac];
}

test.each(keys)("in a %s, %o gives %s, wherever the keyboard has it", (place, chord, command) => {
  fc.assert(
    fc.property(code, fc.constantFrom(...computersOf(chord)), (at, mac) => {
      expect(commandOf(place, pressOf(chord, at, mac), mac)).toBe(command);
    }),
  );
});

// A key pressed, and the chord it is on a US keyboard, if it's one: a key named for what it does as
// itself; a Latin letter, in either case as Caps Lock types it and wherever the keyboard has it, as
// itself; another script's letter as the letter a US keyboard has on its key, if it's a letter's;
// another character as itself, whether the keyboard types it with Shift or without; and a key such
// as a dead one, which types nothing yet, as none. Each with Shift and Alt as pressed.
const anyPress = fc.oneof(
  fc
    .record({
      key: fc.constantFrom(
        "Enter",
        "Backspace",
        "Escape",
        "ArrowDown",
        "ArrowUp",
        "ArrowLeft",
        "ArrowRight",
        "ContextMenu",
        "F10",
        "Tab",
      ),
      code,
      shiftKey: fc.boolean(),
      altKey: fc.boolean(),
    })
    .map((press) => ({
      press: { ...plain, ...press },
      chord: { key: press.key, shift: press.shiftKey, alt: press.altKey },
    })),
  fc
    .record({
      letter: latin,
      capsLock: fc.boolean(),
      code,
      shiftKey: fc.boolean(),
      altKey: fc.boolean(),
    })
    .map(({ letter, capsLock, ...press }) => ({
      press: { ...plain, ...press, key: capsLock ? letter.toUpperCase() : letter },
      chord: { key: letter, shift: press.shiftKey, alt: press.altKey },
    })),
  fc
    .record({ key: otherLetter, at: latin, shiftKey: fc.boolean(), altKey: fc.boolean() })
    .map(({ key, at, shiftKey, altKey }) => ({
      press: { ...plain, key, code: codeOf(at), shiftKey, altKey },
      chord: { key: at, shift: shiftKey, alt: altKey },
    })),
  fc
    .record({
      key: otherLetter,
      code: fc.constantFrom("Digit2", "BracketLeft", "Semicolon", ""),
      shiftKey: fc.boolean(),
      altKey: fc.boolean(),
    })
    .map((press) => ({ press: { ...plain, ...press }, chord: undefined })),
  fc
    .record({
      key: fc.constantFrom("/", "?", "1"),
      code,
      shiftKey: fc.boolean(),
      altKey: fc.boolean(),
    })
    .map((press) => ({
      press: { ...plain, ...press },
      chord: { key: press.key, shift: false, alt: press.altKey },
    })),
  fc
    .record({
      key: fc.constantFrom("Dead", "Unidentified", "Process"),
      code,
      shiftKey: fc.boolean(),
      altKey: fc.boolean(),
    })
    .map((press) => ({ press: { ...plain, ...press }, chord: undefined })),
);

// Whether the chords are the same, with Shift and Alt as each has them.
function sameChord(chord: Chord, other: Chord): boolean {
  return (
    chord.key === other.key &&
    (chord.shift ?? false) === (other.shift ?? false) &&
    (chord.alt ?? false) === (other.alt ?? false) &&
    (chord.primary ?? false) === (other.primary ?? false)
  );
}

// The command the table lists the chord as giving in the place, on a Mac or elsewhere, if it lists
// it there.
function listedCommand(place: Place, chord: Chord | undefined, mac: boolean): Command | undefined {
  const [listed] = keys.flatMap(([at, listedChord, command]) =>
    at === place &&
    chord !== undefined &&
    sameChord(listedChord, chord) &&
    computersOf(listedChord).includes(mac)
      ? [command]
      : [],
  );

  return listed;
}

test("a key gives a command in a place only as one of the place's keys", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...places),
      anyPress,
      fc.boolean(),
      (place, { press, chord }, mac) => {
        expect(commandOf(place, press, mac)).toBe(listedCommand(place, chord, mac));
      },
    ),
  );
});

test("no key but the find bar's gives a command with Cmd or Ctrl, which Paseo's own shortcuts take", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...places),
      anyPress,
      fc.constantFrom({ ctrlKey: true }, { metaKey: true }),
      fc.boolean(),
      (place, { press }, modifier, mac) => {
        expect(commandOf(place, { ...press, ...modifier }, mac)).toBeUndefined();
      },
    ),
  );
});

// The letters the table lists, each with the place it's in and the command it gives there.
const letters = keys.filter(([, { key }]) => /^[a-z]$/u.test(key));

// How a key types the letter: as itself, in either case as Caps Lock types it, wherever the
// keyboard has it, as AZERTY moves some letters; or as another script's letter, on the letter's key.
function typed(letter: string): fc.Arbitrary<Pick<Keys, "key" | "code">> {
  return fc.oneof(
    fc.record({ key: fc.constantFrom(letter, letter.toUpperCase()), code: latin.map(codeOf) }),
    fc.record({ key: otherLetter, code: fc.constant(codeOf(letter)) }),
  );
}

// The chord with Shift, or without it.
function shifted(chord: Chord): Chord {
  return { ...chord, shift: chord.shift !== true };
}

test("a letter gives its command typed as itself or as another script's letter on its key, whatever Caps Lock does, and with Shift only as its key has it", () => {
  fc.assert(
    fc.property(
      fc
        .constantFrom(...letters)
        .chain(([place, chord, command]) =>
          fc.tuple(
            fc.constant(place),
            fc.constant(chord),
            typed(chord.key),
            fc.constant(command),
            fc.constantFrom(...computersOf(chord)),
          ),
        ),
      ([place, chord, { key, code: at }, command, mac]) => {
        const press = { ...pressOf(chord, at, mac), key };

        expect(commandOf(place, press, mac)).toBe(command);
        expect(commandOf(place, { ...press, shiftKey: !press.shiftKey }, mac)).toBe(
          listedCommand(place, shifted(chord), mac),
        );
      },
    ),
  );
});

test.each<[string, Place, Pick<Keys, "key" | "code">, Command | undefined]>([
  ["E with Caps Lock", "bar", { key: "E", code: "KeyE" }, "more"],
  ["Cyrillic у, on E's key", "bar", { key: "у", code: "KeyE" }, "more"],
  ["Cyrillic У with Caps Lock, on E's key", "lines", { key: "У", code: "KeyE" }, "more"],
  ["Dvorak's E, on D's key", "bar", { key: "e", code: "KeyD" }, "more"],
  ["Dvorak's E with Caps Lock, on D's key", "bar", { key: "E", code: "KeyD" }, "more"],
  ["Dvorak's period, on E's key", "bar", { key: ".", code: "KeyE" }, undefined],
  ["Cyrillic х, on ['s key", "bar", { key: "х", code: "BracketLeft" }, undefined],
  [
    "Devanagari क्ष, more than one character, on E's key",
    "bar",
    { key: "क्ष", code: "KeyE" },
    "more",
  ],
  ["a € on E's key, which isn't a letter", "bar", { key: "€", code: "KeyE" }, undefined],
  ["a dead key, on E's key", "bar", { key: "Dead", code: "KeyE" }, undefined],
])("%s, in a %s, %o, gives %s", (_, place, press, command) => {
  expect(commandOf(place, { ...plain, ...press }, false)).toBe(command);
});

test("another character gives its command whichever way the keyboard types it, with Shift or without", () => {
  expect(commandOf("panel", { ...plain, key: "/", code: "Digit7", shiftKey: true }, true)).toBe(
    "filter",
  );
  expect(
    commandOf("panel", { ...plain, key: "?", code: "Slash", shiftKey: true }, true),
  ).toBeUndefined();
});

test("with Alt, a key gives another command or none, as it changes the character it types", () => {
  expect(
    commandOf("panel", { ...plain, key: "/", code: "Slash", altKey: true }, false),
  ).toBeUndefined();
  expect(
    commandOf("bar", { ...plain, key: "e", code: "KeyE", altKey: true }, false),
  ).toBeUndefined();
  expect(
    commandOf("bar", { ...plain, key: "Enter", code: "Enter", altKey: true }, false),
  ).toBeUndefined();
  expect(commandOf("find", { ...plain, key: "ç", code: "KeyC", altKey: true }, true)).toBe(
    "matchCase",
  );
});

test.each<Command>(["stage", "discard", "stageFile", "discardFile", "menu", "more", "moreFile"])(
  "%s runs once however long its key is held down",
  (command) => {
    expect(isHeld(command, { ...plain, key: "x", code: "KeyX", repeat: true })).toBe(true);
    expect(isHeld(command, { ...plain, key: "x", code: "KeyX", repeat: false })).toBe(false);
  },
);

test.each<Command>(["down", "up", "extendDown", "collapse", "single", "filter", "cancel"])(
  "%s runs again and again while its key is held down",
  (command) => {
    expect(isHeld(command, { ...plain, key: "x", code: "KeyX", repeat: true })).toBe(false);
  },
);

test("a command's key is the first that gives it in the place, and a place where none does has none", () => {
  expect(chordOf("filter", "first", true)).toStrictEqual(down);
  expect(chordOf("row", "menu", false)).toStrictEqual({ key: "ContextMenu" });
  expect(chordOf("bar", "stageFile", true)).toStrictEqual({ ...enter, shift: true });
  expect(chordOf("row", "stage", false)).toBeUndefined();
});

test.each([
  [{ key: "Enter" }, "↩", "Enter"],
  [{ key: "Backspace", shift: true }, "⇧⌫", "Shift+Backspace"],
  [{ key: "ArrowDown", alt: true }, "⌥↓", "Alt+↓"],
  [{ key: "Enter", shift: true, alt: true }, "⌥⇧↩", "Alt+Shift+Enter"],
  [{ key: "ArrowUp" }, "↑", "↑"],
  [{ key: "ArrowLeft" }, "←", "←"],
  [{ key: "ArrowRight" }, "→", "→"],
  [{ key: "Escape" }, "Esc", "Esc"],
  [{ key: "ContextMenu" }, "Menu", "Menu"],
  [{ key: "F10", shift: true }, "⇧F10", "Shift+F10"],
  [{ key: "e" }, "E", "E"],
  [{ key: "/" }, "/", "/"],
  [{ key: "f", primary: true }, "⌘F", "Ctrl+F"],
  [{ key: "g", shift: true, primary: true }, "⇧⌘G", "Ctrl+Shift+G"],
  [{ key: "c", alt: true }, "⌥C", "Alt+C"],
  [{ key: "F3", shift: true }, "⇧F3", "Shift+F3"],
  [{ key: "Enter", shift: true, alt: true, primary: true }, "⌥⇧⌘↩", "Ctrl+Alt+Shift+Enter"],
])("%o is written %s on a Mac, and %s elsewhere", (chord, mac, elsewhere) => {
  expect(chordText(chord, true)).toBe(mac);
  expect(chordText(chord, false)).toBe(elsewhere);
});
