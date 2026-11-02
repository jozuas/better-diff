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
