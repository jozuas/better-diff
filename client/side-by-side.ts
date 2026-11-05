import { blocksOf, lineKey } from "./lines";
import type { IndexedLine, NumberedLine, Run } from "./lines";

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

// Added lines each on a row of its own.
function alone(added: readonly IndexedLine[]): Row[] {
  return added.map((line) => ({ old: undefined, new: line }));
}

// A run of changes' rows, as delta lines them up: each removed line in turn level with the added
// line it's paired with, after the added lines before that one, or on a row of its own, and the
// added lines after the last one paired.
function runRows({ removed, added }: Run, partners: ReadonlyMap<number, number>): Row[] {
  const rows: Row[] = [];
  let next = 0;

  for (const line of removed) {
    const partner = added.findIndex(({ index }) => index === partners.get(line.index));

    if (partner === -1) {
      rows.push({ old: line, new: undefined });
    } else {
      rows.push(...alone(added.slice(next, partner)), { old: line, new: added[partner] });
      next = partner + 1;
    }
  }

  return [...rows, ...alone(added.slice(next))];
}

// The lines side by side, an unchanged one level with itself, and the lines of each run of changes
// between unchanged ones as delta lines them up, by the index of the added line each paired removed
// line is paired with.
export function rowsOf(
  lines: readonly NumberedLine[],
  partners: ReadonlyMap<number, number>,
): Row[] {
  return blocksOf(lines).flatMap((block) =>
    "removed" in block ? runRows(block, partners) : [{ old: block, new: block }],
  );
}

// Tells the row apart from the others shown with it, as its line on the old side does, or on the new
// one if it has none there.
export function rowKey(row: Row): string {
  const shown = row.old ?? row.new;

  // Stryker disable next-line ConditionalExpression,StringLiteral: rowsOf makes no row without a line.
  return shown === undefined ? "" : lineKey(shown.line);
}
