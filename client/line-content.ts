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

type Run = NumberedLine["runs"][number];

// Whether the lists have alike items in the same order: each of the first's alike the second's at
// its place, and the second no longer. Item by item, without making lists, since a view of
// thousands of lines compares each line each time it renders them.
function alikeItems<Item>(
  before: readonly Item[],
  after: readonly Item[],
  alike: (item: Item, other: Item) => boolean,
): boolean {
  return (
    after.length <= before.length &&
    before.every((item, index) => {
      const other = after[index];

      return other !== undefined && alike(item, other);
    })
  );
}

function sameRun([length, style]: Run, [otherLength, otherStyle]: Run): boolean {
  return length === otherLength && style === otherStyle;
}

function sameRange({ start, end }: TextRange, other: TextRange): boolean {
  return start === other.start && end === other.end;
}

// Whether the line's text's pieces render as they did, whatever its numbers and id, though what
// they render with is made anew, as each time its diff is read again: by its kind, which its
// trailing whitespace is marked by, its text, its runs and its changed text.
export function textAsBefore(before: TextContent, after: TextContent): boolean {
  return (
    before.line.kind === after.line.kind &&
    before.line.text === after.line.text &&
    alikeItems(before.line.runs, after.line.runs, sameRun) &&
    alikeItems(before.changes, after.changes, sameRange)
  );
}

// Whether the line renders as it did, though what it renders with is made anew: its text's pieces,
// and its id, its numbers, whether it's selected and its newline.
export function lineAsBefore(before: LineContent, after: LineContent): boolean {
  return (
    textAsBefore(before, after) &&
    before.id === after.id &&
    before.selectable === after.selectable &&
    before.line.oldNumber === after.line.oldNumber &&
    before.line.newNumber === after.line.newNumber &&
    before.line.newline === after.line.newline &&
    before.selected === after.selected &&
    before.side === after.side
  );
}
