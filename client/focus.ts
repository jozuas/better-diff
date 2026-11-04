import { createContext } from "react";

import type { OpenFile } from "./groups";
import { shownFileKey } from "./shown-diffs";

// A file's row in the sidebar, by its button that opens the file.
interface Row {
  focus: () => void;
}

// A hunk's index in the view's hunks: its file's index in the view, and its own in the file's diff.
type Place = readonly [number, number];

// A hunk of a diff the view shows, by its bar's button that stages it, or unstages it.
interface Hunk {
  file: OpenFile;
  place: Place;
  focus: () => void;
  // Scrolls the view to show the hunk from its start.
  show: () => void;
}

// Where keys move focus to in a panel: the sidebar's rows and the shown hunks' bars, as they're
// added until the functions adding them return are called.
export interface KeyboardFocus {
  addRow: (file: OpenFile, row: Row) => () => void;
  addHunk: (hunk: Hunk) => () => void;
  toRow: (file: OpenFile) => void;
  // Moves focus to the file's first hunk, and shows it, if the view shows any.
  toHunks: (file: OpenFile) => void;
  // Moves focus to the hunk after the one at the place, 1, or before it, -1, and shows it. Nothing
  // past either end.
  toHunkBy: (place: Place, step: 1 | -1) => void;
  // Holds the hunk's place in the view's order, as an action on it runs with focus in its bar. A
  // place no hunk is at holds none.
  hold: (place: Place) => void;
  // Once no action is `busy` and the view shows hunks, moves focus to the one in the place held, or
  // the last, if nothing has focus, as once the action's hunk is gone, and lets go of the place.
  settle: (busy: boolean, unfocused: boolean) => void;
}

function inOrder(hunks: Iterable<Hunk>): Hunk[] {
  return [...hunks].toSorted(
    ({ place: [file, hunk] }, { place: [otherFile, otherHunk] }) =>
      file - otherFile || hunk - otherHunk,
  );
}

function indexIn(hunks: readonly Hunk[], [file, hunk]: Place): number {
  return hunks.findIndex(({ place }) => place[0] === file && place[1] === hunk);
}

function moveTo(hunk: Hunk | undefined): void {
  hunk?.focus();
  hunk?.show();
}

export function keyboardFocus(): KeyboardFocus {
  const rows = new Map<string, Row>();
  const hunks = new Set<Hunk>();
  // The index in the view's order of the place held, or -1 while none is.
  let held = -1;

  return {
    addRow: (file, row) => {
      rows.set(shownFileKey(file), row);

      return () => {
        rows.delete(shownFileKey(file));
      };
    },
    addHunk: (hunk) => {
      hunks.add(hunk);

      return () => {
        hunks.delete(hunk);
      };
    },
    toRow: (file) => {
      rows.get(shownFileKey(file))?.focus();
    },
    toHunks: ({ group, path }) => {
      moveTo(inOrder(hunks).find(({ file }) => file.group === group && file.path === path));
    },
    toHunkBy: (place, step) => {
      const shown = inOrder(hunks);
      const index = indexIn(shown, place);

      if (index !== -1) {
        moveTo(shown[index + step]);
      }
    },
    hold: (place) => {
      held = indexIn(inOrder(hunks), place);
    },
    settle: (busy, unfocused) => {
      const shown = inOrder(hunks);

      if (busy || shown.length === 0) {
        return;
      }

      if (unfocused) {
        shown[Math.min(held, shown.length - 1)]?.focus();
      }

      held = -1;
    },
  };
}

// The panel's, which its sidebar and diff share.
export const KeyboardFocusContext = createContext(keyboardFocus());
