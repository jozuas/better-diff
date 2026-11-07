import * as fc from "fast-check";
import { expect, test } from "vitest";

import { handled, heard, takesText } from "./key-events";
import type { KeyEvent } from "./key-events";
import type { Place } from "./keymap";

const plain = {
  code: "",
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  repeat: false,
  defaultPrevented: false,
  target: { tagName: "DIV", isContentEditable: false },
};

function keyed(key: string, change: Partial<KeyEvent> = {}): KeyEvent {
  return { ...plain, key, ...change };
}

const places: Place[] = ["row", "heading", "bar", "lines", "menu", "panel", "question"];

// Elements that take text typed in them, as the page has them.
const textFields = [
  { tagName: "INPUT" },
  { tagName: "TEXTAREA" },
  { tagName: "SELECT" },
  { tagName: "DIV", isContentEditable: true },
];

test("a key gives the command it does in the place", () => {
  expect(heard("bar", keyed("Enter"), false)).toBe("stage");
  expect(heard("panel", keyed("/"), false)).toBe("filter");
  expect(heard("filter", keyed("Escape"), false)).toBe("clear");
  expect(heard("question", keyed("Escape"), false)).toBe("cancel");
  expect(heard("bar", keyed("x"), false)).toBeUndefined();
});

test("a key held down whose command runs once is held, and one whose command runs again isn't", () => {
  expect(heard("bar", keyed("Backspace", { repeat: true }), false)).toBe("held");
  expect(heard("bar", keyed("ArrowDown", { repeat: true }), false)).toBe("down");
});

test("keys typed into a text field give no command, but in the filter and the find bar", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...places),
      fc.constantFrom(...textFields),
      fc.constantFrom("w", "/", "Escape", "Enter", "ArrowDown", "e"),
      (place, target, key) => {
        expect(heard(place, keyed(key, { target }), false)).toBeUndefined();
      },
    ),
  );

  expect(heard("filter", keyed("Enter", { target: { tagName: "INPUT" } }), false)).toBe("first");
  expect(heard("find", keyed("Enter", { target: { tagName: "INPUT" } }), false)).toBe("next");
});

test("a key with Cmd or Ctrl, which types nothing, gives its command in a text field too", () => {
  const input = { target: { tagName: "INPUT" } };

  expect([
    heard("panel", keyed("f", { ...input, metaKey: true }), true),
    heard("panel", keyed("f", { ...input, ctrlKey: true }), false),
    heard("panel", keyed("f", input), true),
  ]).toStrictEqual(["find", "find", undefined]);
});

test("the find bar's keys give their commands as they are on a Mac, or elsewhere", () => {
  expect([
    heard("panel", keyed("g", { metaKey: true }), true),
    heard("panel", keyed("g", { ctrlKey: true }), false),
    heard("panel", keyed("F3"), false),
    heard("panel", keyed("F3"), true),
  ]).toStrictEqual(["findNext", undefined, "findNext", undefined]);
});

test("a key pressed with nothing as its target, or in an element that isn't a text field, gives its command", () => {
  expect(heard("panel", keyed("/", { target: null }), false)).toBe("filter");
  expect(heard("panel", keyed("/", { target: {} }), false)).toBe("filter");
});

test("a key something inside the element handled gives no command", () => {
  fc.assert(
    fc.property(fc.constantFrom(...places, "filter" as const), (place) => {
      expect(heard(place, keyed("ArrowDown", { defaultPrevented: true }), false)).toBeUndefined();
    }),
  );
});

test.each(textFields)("%o takes text typed in it", (element) => {
  expect(takesText(element)).toBe(true);
});

test.each([
  null,
  {},
  { tagName: "DIV" },
  { tagName: "BUTTON", isContentEditable: false },
  { isContentEditable: false },
])("%o takes no text typed in it", (element) => {
  expect(takesText(element)).toBe(false);
});

test("a key held down is handled without running its command, and one that gives none isn't", () => {
  const run: string[] = [];

  function running(command: string): boolean {
    run.push(command);

    return true;
  }

  expect(handled("held", running)).toBe(true);
  expect(handled(undefined, running)).toBe(false);
  expect(run).toStrictEqual([]);
});

test("a key that gives a command is handled once what runs it says it did something with it", () => {
  const run: string[] = [];

  expect(
    handled("stage", (command) => {
      run.push(command);

      return true;
    }),
  ).toBe(true);
  expect(handled("stage", () => false)).toBe(false);
  expect(run).toStrictEqual(["stage"]);
});
