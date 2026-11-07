import type { TextRange } from "./changed-text";
import type { FoundRange } from "./find";
import type { NumberedLine } from "./lines";
import type { PointerHandlers } from "./pointed";
import type { Side } from "./side-by-side";

// What a diff's line's text renders its pieces from.
export interface TextContent {
  line: NumberedLine;
  changes: readonly TextRange[];
  // What the find bar found in it.
  found: readonly FoundRange[];
}

// What a diff's line renders with, but its styles.
export interface LineContent extends TextContent {
  // By which a selection finds a hunk's line, and the view keeps its place.
  id: string;
  selected: boolean;
  // The side it shows on, with only that version's number, or undefined inline, with both.
  side: Side | undefined;
  selectable: boolean;
  // What hears the pointer come over the line and leave it, the same each time for the same line,
  // where it can be commented on.
  pointer: PointerHandlers | undefined;
  // Starts a comment on the line, while the pointer is over it and it can be commented on.
  onComment: (() => void) | undefined;
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

function sameFound(found: FoundRange, other: FoundRange): boolean {
  return sameRange(found, other) && found.current === other.current;
}

// Whether the line's text's pieces render as they did, whatever its numbers and id, though what
// they render with is made anew, as each time its diff is read again: by its kind, which its
// trailing whitespace is marked by, its text, its runs, its changed text and what the find bar
// found in it.
export function textAsBefore(before: TextContent, after: TextContent): boolean {
  return (
    before.line.kind === after.line.kind &&
    before.line.text === after.line.text &&
    alikeItems(before.line.runs, after.line.runs, sameRun) &&
    alikeItems(before.changes, after.changes, sameRange) &&
    alikeItems(before.found, after.found, sameFound)
  );
}

// Whether the line renders as it did, though what it renders with is made anew: its text's pieces,
// and its id, its numbers, whether it's selected, its newline, and what it hears the pointer and
// starts a comment with.
export function lineAsBefore(before: LineContent, after: LineContent): boolean {
  return (
    textAsBefore(before, after) &&
    before.id === after.id &&
    before.selectable === after.selectable &&
    before.line.oldNumber === after.line.oldNumber &&
    before.line.newNumber === after.line.newNumber &&
    before.line.newline === after.line.newline &&
    before.selected === after.selected &&
    before.side === after.side &&
    before.pointer === after.pointer &&
    before.onComment === after.onComment
  );
}
