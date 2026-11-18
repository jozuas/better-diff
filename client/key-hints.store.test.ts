import * as fc from "fast-check";
import { expect, test } from "vitest";

import { keyHints } from "./key-hints";
import type { Hint } from "./key-hints";

// Hints of a few keys and words, so that two lists are often the same, or differ only in where
// one hint ends and the next begins.
const hint = fc.record(
  {
    keys: fc.constantFrom("", "a", "b", "ab", "a\tb"),
    does: fc.constantFrom("", "b", "c", "b\na", "bc"),
  },
  { noNullPrototype: true },
);

const hintList = fc.array(hint, { maxLength: 3 });

// A store, and how many times it's told its listener its hints changed.
function heard() {
  const store = keyHints();
  let changes = 0;

  const unsubscribe = store.subscribe(() => {
    changes += 1;
  });

  return { store, changes: () => changes, unsubscribe };
}

test("a store shows no hints until an owner shows some, and then the owner's, in place of any others", () => {
  fc.assert(
    fc.property(hintList, hintList, (first, second) => {
      const { store } = heard();

      expect(store.state()).toStrictEqual([]);

      store.show("a", first);

      expect(store.state()).toStrictEqual(first);

      store.show("b", second);

      expect(store.state()).toStrictEqual(second);
    }),
  );
});

// How many times the listeners are told of hints shown and then shown again, the same or not.
function toldOf(same: boolean): number {
  return same ? 1 : 2;
}

test("showing an owner's hints again tells the listeners only if they've changed, and leaves the list as it was if not", () => {
  fc.assert(
    fc.property(hintList, hintList, (first, second) => {
      const { store, changes } = heard();

      store.show("a", first);

      const shown = store.state();

      store.show("a", [...second]);

      const same = JSON.stringify(first) === JSON.stringify(second);

      expect(changes()).toBe(toldOf(same));
      expect(store.state() === shown).toBe(same);
      expect(store.state()).toStrictEqual(second);
    }),
    {
      examples: [
        [[{ keys: "a", does: "b" }], [{ keys: "a", does: "c" }]],
        [[{ keys: "ab", does: "c" }], [{ keys: "a", does: "bc" }]],
        [
          [
            { keys: "a", does: "b" },
            { keys: "c", does: "d" },
          ],
          [{ keys: "a", does: "bc\td" }],
        ],
        [[{ keys: "a", does: "b" }], [{ keys: "a", does: "b" }]],
      ],
    },
  );
});

test("the same hints shown by another owner are that owner's, which the first no longer hides", () => {
  const { store, changes } = heard();
  const hints: Hint[] = [{ keys: "a", does: "b" }];

  store.show("a", hints);
  store.show("b", hints);
  store.hide("a");

  expect([store.state(), changes()]).toStrictEqual([hints, 2]);

  store.hide("b");

  expect([store.state(), changes()]).toStrictEqual([[], 3]);

  store.hide("b");

  expect(changes()).toBe(3);
});

test("a listener hears nothing more once it's unsubscribed", () => {
  const { store, changes, unsubscribe } = heard();

  store.show("a", [{ keys: "a", does: "b" }]);
  unsubscribe();
  store.hide("a");

  expect([store.state(), changes()]).toStrictEqual([[], 1]);
});
