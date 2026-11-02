import type { NumberedLine } from "./lines";

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

// A line a side shows, with its index among the lines it's shown from.
interface SideLine {
  index: number;
  line: NumberedLine;
}

// What each side shows level with the other: a line, or nothing, where the other side has more.
export interface Row {
  old: SideLine | undefined;
  new: SideLine | undefined;
}

// The lines side by side, an unchanged one level with itself, and the removed lines of each run of
// changes between unchanged ones level with its added lines, from the top of the run.
export function rowsOf(lines: readonly NumberedLine[]): Row[] {
  const rows: Row[] = [];
  let removed: SideLine[] = [];
  let added: SideLine[] = [];

  function endRun(): void {
    for (let row = 0; row < Math.max(removed.length, added.length); row += 1) {
      rows.push({ old: removed[row], new: added[row] });
    }

    removed = [];
    added = [];
  }

  for (const [index, line] of lines.entries()) {
    if (line.kind === "removed") {
      removed.push({ index, line });
    } else if (line.kind === "added") {
      added.push({ index, line });
    } else {
      endRun();
      rows.push({ old: { index, line }, new: { index, line } });
    }
  }

  endRun();

  return rows;
}
