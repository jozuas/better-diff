import * as fc from "fast-check";
import { expect, test } from "vitest";

import { editorKey, editorKeyUp } from "./comments";

const plain = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };

const modifiers = fc.record({
  shiftKey: fc.boolean(),
  altKey: fc.boolean(),
  ctrlKey: fc.boolean(),
  metaKey: fc.boolean(),
});

test("releasing Escape cancels the comment being written, and pressing it does nothing, whatever modifiers are held", () => {
  fc.assert(
    fc.property(modifiers, (held) => {
      expect(editorKeyUp({ ...held, key: "Escape" })).toBe("cancel");
      expect(editorKey({ ...held, key: "Escape" })).toBeUndefined();
    }),
  );
});

test("releasing any other key does nothing", () => {
  fc.assert(
    fc.property(fc.constantFrom("a", "Enter", "Backspace", "Tab", "ArrowUp", " "), (key) => {
      expect(editorKeyUp({ ...plain, key })).toBeUndefined();
    }),
  );
});

test("pressing Enter with Cmd or Ctrl saves the comment being written, and with Alt too", () => {
  expect(editorKey({ ...plain, key: "Enter", metaKey: true })).toBe("save");
  expect(editorKey({ ...plain, key: "Enter", ctrlKey: true })).toBe("save");
  expect(editorKey({ ...plain, key: "Enter", metaKey: true, ctrlKey: true, altKey: true })).toBe(
    "save",
  );
});

test("pressing Enter on its own, or with Shift, starts a new line", () => {
  expect(editorKey({ ...plain, key: "Enter" })).toBeUndefined();
  expect(editorKey({ ...plain, key: "Enter", shiftKey: true })).toBeUndefined();
  expect(editorKey({ ...plain, key: "Enter", shiftKey: true, metaKey: true })).toBeUndefined();
  expect(editorKey({ ...plain, key: "Enter", altKey: true })).toBeUndefined();
});

test("other keys do as they do in any text box", () => {
  fc.assert(
    fc.property(
      modifiers,
      fc.constantFrom("a", "Backspace", "Tab", "ArrowUp", " "),
      (held, key) => {
        expect(editorKey({ ...held, key })).toBeUndefined();
      },
    ),
  );
});
