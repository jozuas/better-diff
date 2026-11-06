import type { BarAt } from "./focus";
import type { LineRange } from "./selection";

// How a row of the sidebar looks: the open file's, one under the pointer or with focus in it, or
// neither. The first two show the row's buttons.
export type Look = "open" | "revealed" | "plain";

export function lookOf(open: boolean, revealed: boolean): Look {
  if (open) {
    return "open";
  }

  return revealed ? "revealed" : "plain";
}

// Whether a hunk's actions show: while the pointer is over the hunk, focus is in its bar, or lines
// in it are selected. `pointed` and `selected` are the hunks the pointer is over and lines are
// selected in, if any.
export function hunkRevealed(
  hunk: number,
  pointed: number | undefined,
  focused: boolean,
  selected: number | undefined,
): boolean {
  return pointed === hunk || focused || selected === hunk;
}

// The bar a press of the pointer in a diff, outside its bars, moves focus to once it's let go, so
// keys act on what it pressed: the bar of the hunk whose lines it selected, or else of the hunk it
// was pressed in, if it was.
export function pressedBar(
  selected: Pick<LineRange, "file" | "hunk"> | undefined,
  pressed: BarAt | undefined,
): BarAt | undefined {
  return selected === undefined ? pressed : [selected.file, selected.hunk];
}

// What a hunk's lines are marked with on the page, where they're pressed: their file's index in the
// view, and their hunk's in the file's diff.
export function hunkMark([file, hunk]: BarAt): string {
  return `${file}:${hunk}`;
}

// The hunk whose lines the mark is, if it's one.
export function markedHunk(mark: string | undefined): BarAt | undefined {
  const groups = mark?.match(/^(?<file>\d+):(?<hunk>\d+)$/u)?.groups;

  return groups === undefined ? undefined : [Number(groups["file"]), Number(groups["hunk"])];
}

// Whether Enter and Backspace press a hunk's own buttons from its bar: while focus is on the bar
// itself, and no lines in it are selected, whose buttons they press then.
export function hunkKeyed(onBar: boolean, linesSelected: boolean): boolean {
  return onBar && !linesSelected;
}
