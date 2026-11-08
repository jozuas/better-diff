import type { BarAt } from "./focus";
import type { LineRange } from "./selection";

// How a row of the sidebar looks: open, as the open file's, the open group's or a selected file's;
// selected, as an open row whose buttons hide; under the pointer or with focus in it; or none of
// these. Open and revealed rows show their buttons.
export type Look = "open" | "selected" | "revealed" | "plain";

// `always` is whether the row shows its buttons while it's open even if it isn't revealed: the open
// file's and the open group's do, and of the files selected, as in VS Code's Source Control view,
// only the row of the one they reach.
export function lookOf(open: boolean, always: boolean, revealed: boolean): Look {
  if (open) {
    return always || revealed ? "open" : "selected";
  }

  return revealed ? "revealed" : "plain";
}

export function showsButtons(look: Look): boolean {
  return look === "open" || look === "revealed";
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
