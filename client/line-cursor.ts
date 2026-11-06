import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";
import type { HunkEnd } from "./focus";
import type { LineRange } from "./selection";
import { shows } from "./side-by-side";
import type { Side } from "./side-by-side";

export type Kind = RpcOutput<typeof diffRpc>["hunks"][number]["lines"][number]["kind"];

// Lines of a hunk selected with keys, by their indices in the hunk: the one the selection started
// at, and the one it reaches, on a side of a side-by-side view.
export interface Cursor {
  anchor: number;
  head: number;
  side: Side | undefined;
}

// The indices of the hunk's lines that show on the side, or inline.
export function linesOn(kinds: readonly Kind[], side: Side | undefined): number[] {
  return kinds.flatMap((kind, index) => (shows(side, kind) ? [index] : []));
}

// Just the line, on the side, side by side.
export function at(line: number, side?: Side): Cursor {
  return { anchor: line, head: line, side };
}

// The hunk's first changed line, on the side it shows on side by side: the old version's, for a
// removed line, and the new one's for an added one. None for a hunk without changes.
export function firstChanged(kinds: readonly Kind[], sideBySide: boolean): Cursor | undefined {
  const line = kinds.findIndex((kind) => kind !== "context");

  if (line === -1) {
    return undefined;
  }

  if (!sideBySide) {
    return at(line);
  }

  return at(line, kinds[line] === "removed" ? "old" : "new");
}

// The hunk's first line on the side, or its last.
export function atEnd(
  kinds: readonly Kind[],
  side: Side | undefined,
  end: HunkEnd,
): Cursor | undefined {
  const lines = linesOn(kinds, side);
  const line = end === "first" ? lines[0] : lines.at(-1);

  return line === undefined ? undefined : at(line, side);
}

// Just the line after the one the cursor reaches, 1, or before it, -1, on its side. None past
// either end of the hunk.
export function moved(
  { head, side }: Cursor,
  kinds: readonly Kind[],
  step: 1 | -1,
): Cursor | undefined {
  const lines = linesOn(kinds, side);
  const next = lines[lines.indexOf(head) + step];

  return next === undefined ? undefined : at(next, side);
}

// The cursor reaching one line further, 1, or one less, -1, on its side, as far as either end of
// the hunk.
export function extended(cursor: Cursor, kinds: readonly Kind[], step: 1 | -1): Cursor {
  const lines = linesOn(kinds, cursor.side);
  const head = lines[lines.indexOf(cursor.head) + step];

  return head === undefined ? cursor : { ...cursor, head };
}

// Lines of a hunk, by their indices in it, from the first to the last.
interface Span {
  first: number;
  last: number;
}

// The lines it selects.
function spanOf({ anchor, head }: Cursor): Span {
  return { first: Math.min(anchor, head), last: Math.max(anchor, head) };
}

// The lines of a view's files the page's text selection touches, and whether it was made from its
// end back to its start, as by dragging upwards.
export interface Selected {
  range: LineRange;
  backward: boolean;
}

// The lines selected in the hunk at the index `hunk` of the file at the index `file` in the view,
// if they're any of its, on the side with focus side by side: from the line the selection was
// started at to the one it reaches.
export function selectedCursor(
  selected: Selected | undefined,
  file: number,
  hunk: number,
  side: Side | undefined,
): Cursor | undefined {
  if (selected === undefined || selected.range.file !== file || selected.range.hunk !== hunk) {
    return undefined;
  }

  const { first, last } = selected.range;

  return selected.backward
    ? { anchor: last, head: first, side }
    : { anchor: first, head: last, side };
}

// The lines the cursor selects in the hunk at the index of the file at the index in the view.
export function rangeOf(cursor: Cursor, file: number, hunk: number): LineRange {
  const range = { file, hunk, ...spanOf(cursor) };

  return cursor.side === undefined ? range : { ...range, side: cursor.side };
}
