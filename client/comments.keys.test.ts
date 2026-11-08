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

// A key's code, but for the 229 of a key an input method takes.
const keyCode = fc.nat({ max: 255 }).filter((code) => code !== 229);

// A key an input method takes while it composes text, or once it's done, as some browsers give it.
const composing = fc.oneof(
  fc.record({ isComposing: fc.constant(true), keyCode }),
  fc.constant({ isComposing: false, keyCode: 229 }),
);

const typing = fc.record({ isComposing: fc.constant(false), keyCode });

test("releasing Escape cancels the comment being written, and pressing it does nothing, whatever modifiers are held", () => {
  fc.assert(
    fc.property(modifiers, typing, (held, typed) => {
      expect(editorKeyUp({ ...held, key: "Escape" })).toBe("cancel");
      expect(editorKey({ ...held, ...typed, key: "Escape" })).toBeUndefined();
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

test("pressing Enter without Shift saves the comment being written, or sends the review, whether Cmd, Ctrl or Alt is held or not, as Paseo's message box sends a message", () => {
  fc.assert(
    fc.property(modifiers, typing, (held, typed) => {
      expect(editorKey({ ...held, ...typed, shiftKey: false, key: "Enter" })).toBe("save");
    }),
  );
});

test("pressing Enter with Shift starts a new line, whatever else is held", () => {
  fc.assert(
    fc.property(modifiers, typing, (held, typed) => {
      expect(editorKey({ ...held, ...typed, shiftKey: true, key: "Enter" })).toBeUndefined();
    }),
  );
});

test("pressing Enter while an input method composes text only picks what it composes, whatever is held", () => {
  fc.assert(
    fc.property(modifiers, composing, (held, composed) => {
      expect(editorKey({ ...held, ...composed, key: "Enter" })).toBeUndefined();
    }),
  );
});

test("other keys do as they do in any text box", () => {
  fc.assert(
    fc.property(
      modifiers,
      fc.oneof(typing, composing),
      fc.constantFrom("a", "Backspace", "Tab", "ArrowUp", " "),
      (held, typed, key) => {
        expect(editorKey({ ...held, ...typed, key })).toBeUndefined();
      },
    ),
  );
});
