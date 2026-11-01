// How a row of the sidebar looks: the open file's, one under the pointer or with focus in it, or
// neither. The first two show the row's buttons.
export type Look = "open" | "revealed" | "plain";

export function lookOf(open: boolean, revealed: boolean): Look {
  if (open) {
    return "open";
  }

  return revealed ? "revealed" : "plain";
}
