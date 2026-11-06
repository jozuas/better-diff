import type { HunkEnd } from "./focus";
import { atEnd, firstChanged } from "./line-cursor";
import type { Cursor, Kind } from "./line-cursor";
import type { Focus } from "./side-by-side";

// What selects a hunk's lines on the page.
export interface LinePage {
  // Selects the hunk's lines from the one at the index `anchor` to the one at `head`, on the side
  // with focus, side by side.
  select: (anchor: number, head: number) => void;
  // Scrolls the view to show the hunk's line.
  reveal: (line: number) => void;
  // Runs the task once what's rendering now has rendered.
  afterRender: (task: () => void) => void;
}

// Selects the cursor's lines, and shows the line it reaches: side by side, once the cursor's side
// has focus, as pressing the side would give it.
export function selectCursor(cursor: Cursor, sides: Focus | undefined, page: LinePage): void {
  function show(): void {
    page.select(cursor.anchor, cursor.head);
    page.reveal(cursor.head);
  }

  if (sides === undefined || cursor.side === undefined || cursor.side === sides.side) {
    show();

    return;
  }

  sides.onFocus(cursor.side);
  page.afterRender(show);
}

// Where keys move a selection into a hunk's lines: at its first changed line, or at its first line
// or its last, on the side with focus, side by side, or else at its first changed line.
export function enteredAt(
  end: HunkEnd | "changed",
  kinds: readonly Kind[],
  sides: Focus | undefined,
): Cursor | undefined {
  const changed = firstChanged(kinds, sides !== undefined);

  return end === "changed" ? changed : (atEnd(kinds, sides?.side, end) ?? changed);
}
