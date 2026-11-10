import type { Point } from "./menu";

// Where the bar over a hunk's selected lines is asked to show from: where the pointer let go of the
// selection, or the line the keyboard selected up to, by its index among the hunk's lines.
type BarFrom = { point: Point } | { head: number };

// Asks a diff's hunks to show the bar over their selected lines, as the keyboard selecting them in
// a hunk's bar does, or the pointer letting go of a selection pressed elsewhere, and what hears each
// hunk asked.
export interface BarRequests {
  show: (hunk: number, from: BarFrom) => void;
  // Calls the listener each time the hunk at the index is asked, until the returned function is
  // called.
  subscribe: (hunk: number, listener: (from: BarFrom) => void) => () => void;
}

export function barRequests(): BarRequests {
  const listeners = new Map<number, Set<(from: BarFrom) => void>>();

  return {
    show: (hunk, from) => {
      for (const listener of listeners.get(hunk) ?? []) {
        listener(from);
      }
    },
    subscribe: (hunk, listener) => {
      const heard = listeners.get(hunk) ?? new Set();

      heard.add(listener);
      listeners.set(hunk, heard);

      return () => {
        heard.delete(listener);
      };
    },
  };
}
