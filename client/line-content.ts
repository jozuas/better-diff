import type { TextRange } from "./changed-text";
import type { NumberedLine } from "./lines";
import type { Side } from "./side-by-side";

// What a diff's line's text renders its pieces from.
export interface TextContent {
  line: NumberedLine;
  changes: readonly TextRange[];
}

// What a diff's line renders with, but its styles.
export interface LineContent extends TextContent {
  // By which a selection finds a hunk's line, and the view keeps its place.
  id: string;
  selected: boolean;
  // The side it shows on, with only that version's number, or undefined inline, with both.
  side: Side | undefined;
  selectable: boolean;
}

type Value = string | number | boolean | null | undefined;

// What the line's text's pieces render from, as a list of values, the same for two lines whose
// pieces render the same: its kind, which its trailing whitespace is marked by, its text, its runs
// and its changed text. A run's pair of values ends in a style or null, and a range of changed
// text's in a number, so they don't run together.
function textValues({ line, changes }: TextContent): Value[] {
  return [
    line.kind,
    line.text,
    ...line.runs.flat(),
    ...changes.flatMap(({ start, end }) => [start, end]),
  ];
}

function sameValues(before: readonly Value[], after: readonly Value[]): boolean {
  return before.length === after.length && before.every((value, index) => value === after[index]);
}

// Whether the line's text's pieces render as they did, whatever its numbers and id, though what
// they render with is made anew, as each time its diff is read again.
export function textAsBefore(before: TextContent, after: TextContent): boolean {
  return sameValues(textValues(before), textValues(after));
}

// What the rest of the line renders from: its id, its numbers, whether it's selected and its
// newline.
function restValues({ id, selectable, line, selected, side }: LineContent): Value[] {
  return [id, selectable, line.oldNumber, line.newNumber, line.newline, selected, side];
}

// Whether the line renders as it did, though what it renders with is made anew.
export function lineAsBefore(before: LineContent, after: LineContent): boolean {
  return textAsBefore(before, after) && sameValues(restValues(before), restValues(after));
}
