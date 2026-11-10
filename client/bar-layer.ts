import { createContext } from "react";

import type { Controls, IconAction } from "./actions";
import type { LetGo } from "./menu";
import type { Bar } from "./shortcuts";

// The bar over a selection of a view's lines, as the lines show it: where it shows from, the selected
// lines' actions, while lines of a hunk are selected, what starts a comment on them, where they can
// be commented on, and what copies the text selected.
export interface ShownBar {
  at: LetGo;
  lines: Bar<IconAction> | undefined;
  onComment: (() => void) | undefined;
  onCopy: () => void;
  controls: Controls;
}

// The bar over a selection of a view's lines, one at a time, as the lines asked to show it last
// show it. Lines ask with a ticket, later than any before it, so lines whose selection has moved on
// to others can't show theirs again over the others'.
export interface BarLayer<Shown> {
  // The bar shown, if any.
  shown: () => Shown | undefined;
  // Shows the bar, unless one asked with a later ticket shows.
  show: (ticket: number, bar: Shown) => void;
  // Stops showing the bar asked with the ticket, if it shows.
  hide: (ticket: number) => void;
  // Calls the listener each time the bar shown changes, until the returned function is called.
  subscribe: (listener: () => void) => () => void;
}

export function barLayer<Shown>(): BarLayer<Shown> {
  let shown: { ticket: number; bar: Shown } | undefined;
  let latest = -1;
  const listeners = new Set<() => void>();

  function changed(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    shown: () => shown?.bar,
    show: (ticket, bar) => {
      if (ticket >= latest) {
        latest = ticket;
        shown = { ticket, bar };
        changed();
      }
    },
    hide: (ticket) => {
      if (shown?.ticket === ticket) {
        shown = undefined;
        changed();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

let tickets = 0;

// A ticket to show a bar with, later than every one before it.
export function nextTicket(): number {
  tickets += 1;

  return tickets;
}

// Where a view's lines show the bar over their selection: its layer, and the id of the element it
// shows in, over the view's scrolling content.
export interface BarHost {
  layer: BarLayer<ShownBar>;
  id: string;
}

// Undefined for lines outside a view with one, which show the bar nowhere.
export const BarHostContext = createContext<BarHost | undefined>(undefined);
