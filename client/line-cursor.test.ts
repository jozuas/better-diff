import * as fc from "fast-check";
import { expect, test } from "vitest";

import {
  at,
  atEnd,
  extended,
  firstChanged,
  linesOn,
  moved,
  rangeOf,
  selectedCursor,
} from "./line-cursor";
import type { Cursor, Kind } from "./line-cursor";
import type { Side } from "./side-by-side";

const kind = fc.constantFrom<Kind>("context", "removed", "added");

const nothing: undefined[] = [];

// No side, as inline.
const inline: (Side | undefined)[] = [];

// A hunk's lines' kinds, and a side to show them on, or none inline.
const kindsAndSide = fc.tuple(
  fc.array(kind, { maxLength: 20 }),
  fc.constantFrom<Side | undefined>(undefined, "old", "new"),
);

// A hunk's lines' kinds, a side, and one of the lines on the side as a cursor's head and anchor.
const cursorIn = kindsAndSide
  .filter(([kinds, side]) => linesOn(kinds, side).length > 0)
  .chain(([kinds, side]) =>
    fc.tuple(
      fc.constant(kinds),
      fc.constantFrom(...linesOn(kinds, side)),
      fc.constantFrom(...linesOn(kinds, side)),
      fc.constant(side),
    ),
  )
  .map(([kinds, anchor, head, side]) => ({ kinds, cursor: { anchor, head, side } }));

test("a side shows its version's lines, the unchanged and its own changes, and inline shows them all", () => {
  const kinds: Kind[] = ["context", "removed", "added", "context"];

  expect(linesOn(kinds, "old")).toStrictEqual([0, 1, 3]);
  expect(linesOn(kinds, "new")).toStrictEqual([0, 2, 3]);
  expect(linesOn(kinds, nothing[0])).toStrictEqual([0, 1, 2, 3]);
});

test("keys move into a hunk's lines at its first change, on its side side by side", () => {
  expect(firstChanged(["context", "added", "removed"], false)).toStrictEqual(at(1));
  expect(firstChanged(["context", "removed", "added"], true)).toStrictEqual(at(1, "old"));
  expect(firstChanged(["context", "added"], true)).toStrictEqual(at(1, "new"));
  expect(firstChanged(["context"], true)).toBeUndefined();
});

test("a hunk's ends on a side are its first and last lines there, and it has none without lines there", () => {
  const kinds: Kind[] = ["removed", "context", "added"];

  expect(atEnd(kinds, "new", "first")).toStrictEqual(at(1, "new"));
  expect(atEnd(kinds, "new", "last")).toStrictEqual(at(2, "new"));
  expect(atEnd(kinds, nothing[0], "first")).toStrictEqual(at(0));
  expect(atEnd(["removed"], "new", "last")).toBeUndefined();
});

// The line a step from the cursor's head on its side, or else the head again.
function stepped({ kinds, cursor }: { kinds: Kind[]; cursor: Cursor }, step: 1 | -1): number {
  const lines = linesOn(kinds, cursor.side);

  return lines[lines.indexOf(cursor.head) + step] ?? cursor.head;
}

test("↓ and ↑ move from each line on a side to just the line a step from it there", () => {
  fc.assert(
    fc.property(
      cursorIn.filter((hunk) => stepped(hunk, 1) !== hunk.cursor.head),
      (hunk) => {
        expect(moved(hunk.cursor, hunk.kinds, 1)).toStrictEqual(
          at(stepped(hunk, 1), hunk.cursor.side),
        );
      },
    ),
  );
  fc.assert(
    fc.property(
      cursorIn.filter((hunk) => stepped(hunk, -1) !== hunk.cursor.head),
      (hunk) => {
        expect(moved(hunk.cursor, hunk.kinds, -1)).toStrictEqual(
          at(stepped(hunk, -1), hunk.cursor.side),
        );
      },
    ),
  );
});

test("↓ from a side's last line and ↑ from its first move nowhere", () => {
  const kinds: Kind[] = ["removed", "context", "added"];

  expect(moved(at(2, "new"), kinds, 1)).toBeUndefined();
  expect(moved(at(1, "new"), kinds, -1)).toBeUndefined();
  expect(moved(at(1, "old"), kinds, 1)).toBeUndefined();
  expect(moved(at(0), kinds, -1)).toBeUndefined();
});

test("with Shift, ↓ and ↑ move the cursor's head on its side, keeping its anchor, as far as either end of the hunk", () => {
  fc.assert(
    fc.property(cursorIn, fc.constantFrom<1 | -1>(1, -1), (hunk, step) => {
      expect(extended(hunk.cursor, hunk.kinds, step)).toStrictEqual({
        ...hunk.cursor,
        head: stepped(hunk, step),
      });
    }),
  );
});

test("a cursor selects the lines from its anchor to its head, whichever is first", () => {
  expect(rangeOf({ anchor: 4, head: 2, side: inline[0] }, 0, 0)).toStrictEqual({
    file: 0,
    hunk: 0,
    first: 2,
    last: 4,
  });
  expect(rangeOf({ anchor: 2, head: 4, side: "old" }, 0, 0)).toStrictEqual({
    file: 0,
    hunk: 0,
    first: 2,
    last: 4,
    side: "old",
  });
});

test("a cursor's range is of the hunk of the file, on its side side by side", () => {
  expect(rangeOf({ anchor: 3, head: 1, side: "new" }, 2, 5)).toStrictEqual({
    file: 2,
    hunk: 5,
    first: 1,
    last: 3,
    side: "new",
  });
  expect(rangeOf(at(1), 0, 0)).toStrictEqual({ file: 0, hunk: 0, first: 1, last: 1 });
});

test("the lines keys select, from the line at the anchor to the one at the head, read back from the page's selection as they were selected", () => {
  fc.assert(
    fc.property(cursorIn, fc.nat(3), fc.nat(3), ({ cursor }, file, hunk) => {
      const selected = {
        range: rangeOf(cursor, file, hunk),
        backward: cursor.anchor > cursor.head,
      };

      expect(selectedCursor(selected, file, hunk, cursor.side)).toStrictEqual(cursor);
    }),
  );
});

test("a selection made from its end back to its start reaches its first line, and one made forwards its last", () => {
  const range = { file: 1, hunk: 2, first: 3, last: 5 };

  expect(selectedCursor({ range, backward: true }, 1, 2, "old")).toStrictEqual({
    anchor: 5,
    head: 3,
    side: "old",
  });
  expect(selectedCursor({ range, backward: false }, 1, 2, inline[0])).toStrictEqual({
    anchor: 3,
    head: 5,
    side: undefined,
  });
});

test("no lines are selected in a hunk without a selection, or with one in another hunk or file", () => {
  const range = { file: 1, hunk: 2, first: 3, last: 5 };

  expect(selectedCursor(nothing[0], 1, 2, inline[0])).toBeUndefined();
  expect(selectedCursor({ range, backward: false }, 1, 3, inline[0])).toBeUndefined();
  expect(selectedCursor({ range, backward: false }, 0, 2, inline[0])).toBeUndefined();
});
