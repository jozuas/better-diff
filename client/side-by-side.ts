import { blocksOf } from "./lines";
import type { IndexedLine, NumberedLine } from "./lines";

type Kind = NumberedLine["kind"];

// The sides of a side-by-side diff: the old version's, with its removed lines, and the new one's,
// with its added lines. An unchanged line shows on both.
export type Side = "old" | "new";

// From left to right.
export const sides: readonly Side[] = ["old", "new"];

// Which side of a side-by-side view has focus, which the page's selection is in, and what hears the
// pointer pressed on one, which gives it focus.
export interface Focus {
  side: Side;
  onFocus: (side: Side) => void;
}

// The kind of line each side leaves to the other. An inline diff, without sides, leaves none.
const others = new Map<Side | undefined, Kind>([
  ["old", "added"],
  ["new", "removed"],
]);

// Whether a line of the kind shows on the side, or in an inline diff.
export function shows(side: Side | undefined, kind: Kind): boolean {
  return kind !== others.get(side);
}

// Where each side's version numbers a line.
const numberKeys = { old: "oldNumber", new: "newNumber" } as const;

// A line's number in a side's version.
interface LineNumber {
  side: Side;
  number: number | undefined;
}

// The numbers a line shows with: inline, its old and new ones, and on a side, that version's.
export function numbersOf(line: NumberedLine, side?: Side): LineNumber[] {
  return sides.flatMap((version) =>
    side === undefined || version === side
      ? [{ side: version, number: line[numberKeys[version]] }]
      : [],
  );
}

// What each side shows level with the other: a line, or nothing, where the other side has more.
export interface Row {
  old: IndexedLine | undefined;
  new: IndexedLine | undefined;
}

// The lines side by side, an unchanged one level with itself, and the removed lines of each run of
// changes between unchanged ones level with its added lines, from the top of the run.
export function rowsOf(lines: readonly NumberedLine[]): Row[] {
  return blocksOf(lines).flatMap((block) =>
    "removed" in block
      ? Array.from({ length: Math.max(block.removed.length, block.added.length) }, (_, row) => ({
          old: block.removed[row],
          new: block.added[row],
        }))
      : [{ old: block, new: block }],
  );
}
