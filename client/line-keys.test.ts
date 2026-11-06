import { expect, test } from "vitest";

import { at } from "./line-cursor";
import type { Kind } from "./line-cursor";
import { enteredAt, selectCursor } from "./line-keys";
import type { LinePage } from "./line-keys";
import type { Focus, Side } from "./side-by-side";

// A page that records what's done on it, running what waits for a render only once `render` is
// called.
function pageOf(done: string[]): LinePage & { render: () => void } {
  const waiting: (() => void)[] = [];

  return {
    select: (anchor, head) => {
      done.push(`select ${anchor}-${head}`);
    },
    reveal: (line) => {
      done.push(`reveal ${line}`);
    },
    afterRender: (task) => {
      waiting.push(task);
    },
    render: () => {
      done.push("render");

      for (const task of waiting.splice(0)) {
        task();
      }
    },
  };
}

// A side-by-side view's focus, on the side, recording each side given focus.
function sidesOf(side: Side, done: string[]): Focus {
  return {
    side,
    onFocus: (given) => {
      done.push(`focus ${given}`);
    },
  };
}

test("selects the cursor's lines from its anchor to its head and shows the line it reaches, inline or on the side with focus", () => {
  const done: string[] = [];
  const page = pageOf(done);
  const none: Focus[] = [];

  selectCursor({ anchor: 4, head: 2, side: undefined }, none[0], page);
  selectCursor({ anchor: 1, head: 3, side: "old" }, sidesOf("old", done), page);

  expect(done).toStrictEqual(["select 4-2", "reveal 2", "select 1-3", "reveal 3"]);
});

test("selects the lines of a cursor on a side in a view that has none, or of one without a side in a view that has, without giving a side focus", () => {
  const done: string[] = [];
  const page = pageOf(done);
  const none: Focus[] = [];

  selectCursor(at(1, "old"), none[0], page);
  selectCursor(at(2), sidesOf("old", done), page);

  expect(done).toStrictEqual(["select 1-1", "reveal 1", "select 2-2", "reveal 2"]);
});

test("side by side, gives the cursor's side focus first, and selects its lines once that's rendered", () => {
  const done: string[] = [];
  const page = pageOf(done);

  selectCursor(at(2, "new"), sidesOf("old", done), page);
  page.render();

  expect(done).toStrictEqual(["focus new", "render", "select 2-2", "reveal 2"]);
});

const kinds: Kind[] = ["context", "removed", "added", "context"];

test("keys enter a hunk's lines at its first change, or at its first line or its last on the side with focus", () => {
  const none: Focus[] = [];

  expect(enteredAt("changed", kinds, sidesOf("new", []))).toStrictEqual(at(1, "old"));
  expect(enteredAt("first", kinds, sidesOf("new", []))).toStrictEqual(at(0, "new"));
  expect(enteredAt("last", kinds, sidesOf("old", []))).toStrictEqual(at(3, "old"));
  expect(enteredAt("last", kinds, none[0])).toStrictEqual(at(3));
  expect(enteredAt("changed", kinds, none[0])).toStrictEqual(at(1));
});

test("keys enter at a hunk's first change where the side with focus has none of its lines", () => {
  expect(enteredAt("first", ["added"], sidesOf("old", []))).toStrictEqual(at(0, "new"));
});
