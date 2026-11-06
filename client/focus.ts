import { createContext } from "react";

import type { GroupName, Open, OpenFile } from "./groups";
import { shownFileKey } from "./shown-diffs";
import type { SidebarStop } from "./sidebar-stops";

// What keys move focus to.
interface Focusable {
  focus: () => void;
}

// Where a bar is in the view's order: its file's index in the view, and then its own in the file's
// diff, the file's bar first, then its mode change's, and then each hunk's by the hunk's index.
export type BarAt = readonly [number, number];

// A file's bar's own index in its file's diff, and its mode change's.
export const fileBar = -2;
export const modeBar = -1;

// Which line of a hunk a selection starts at once keys move it into the hunk.
export type HunkEnd = "first" | "last";

// A bar of a diff the view shows, by its element that has focus.
interface Stop extends Focusable {
  file: OpenFile;
  at: BarAt;
  // Scrolls the view to show the bar's hunk, or file, from its start.
  show: () => void;
  // A hunk's bar's: selects the hunk's first line, or its last, and shows it.
  enter?: (end: HunkEnd) => void;
  // A file's bar's, once its diff shows without hunks, as a binary file's does: focus moves on to it
  // once an action is done, as it does to a hunk's bar.
  bare?: boolean;
}

// The files the sidebar lists, in which keys open the next file from a view of one.
interface ListedFiles {
  // The file listed after the file, 1, or before it, -1, if any.
  listed: (file: OpenFile, step: 1 | -1) => OpenFile | undefined;
  open: (file: OpenFile) => void;
}

// Where keys move focus to in a panel: the sidebar's filter, headings and rows, and the bars of the
// diffs it shows, as they're added until the functions adding them return are called.
export interface KeyboardFocus {
  addRow: (file: OpenFile, row: Focusable) => () => void;
  addHeading: (group: GroupName, heading: Focusable) => () => void;
  addFilter: (filter: Focusable) => () => void;
  addListed: (listed: ListedFiles) => () => void;
  addStop: (stop: Stop) => () => void;
  // Has keys open the next file or the one before past the view's bars, as they do in a view of
  // one file.
  addCrossing: () => () => void;
  toRow: (file: OpenFile) => void;
  toHeading: (group: GroupName) => void;
  // Moves focus to the heading, or the row, if there's one.
  toStop: (stop: SidebarStop | undefined) => void;
  toFilter: () => void;
  // Moves focus to the file's first hunk, or its bar if it has none, and shows it, or while the view
  // doesn't show the file, opens it with `open`, and moves focus there once it shows.
  toFile: (file: OpenFile, open: () => void) => void;
  // Moves focus into the view of the group, to its first file's first hunk, or that file's bar if it
  // has none, and shows it: at once while the group is `open` and its view shows, or else once it
  // does.
  toGroup: (group: GroupName, open: boolean) => void;
  // Moves focus to the bar after the one at the place, 1, or before it, -1, and shows it. Past the
  // view's last bar, or before its first, while it crosses files, opens the next file, with focus
  // on its bar, or the one before, with focus on its last bar once it shows.
  toBarBy: (at: BarAt, step: 1 | -1) => void;
  // Moves focus to the next file's bar after the place, or the one before it, and shows it. Past
  // either end, while the view crosses files, opens the next file or the one before, with focus on
  // its bar.
  toFileBy: (at: BarAt, step: 1 | -1) => void;
  // Moves focus on from the hunk at the place to the next, 1, selecting its first line, or to the
  // one before, -1, selecting its last. Nothing past either end.
  toLinesBy: (at: BarAt, step: 1 | -1) => void;
  // Moves focus to the bar at the place, without scrolling the view to it, as once the pointer is
  // pressed on its hunk's lines.
  toBarAt: (at: BarAt) => void;
  // Gives up moving focus to a file or group keys opened once it shows, as once the pointer is
  // pressed.
  abandon: () => void;
  // Holds the place, in the order of the hunks, and of the bars of files shown without any, of the
  // first one at the place or after it, as an action runs from a bar there.
  hold: (at: BarAt) => void;
  // Once no action is `busy` and the view shows a hunk or a bar to move focus to, moves focus to the
  // one in the place held, or the last, if nothing has focus, as once the bar of what the action
  // ran on is gone, and lets go of the place.
  settle: (busy: boolean, unfocused: boolean) => void;
  // Tells that the view of what's open shows, with its bars, once its diffs are read.
  shown: (view: Open) => void;
}

// What's held of where focus was as an action runs, as the action settles: once no action is
// `busy`, and `find` finds what to move focus to from what's held, moves focus there with `land` if
// nothing has focus, as once what the action ran from is gone, and lets go of it, leaving
// undefined. Held until then.
export function settled<Held, Found>(
  held: Held | undefined,
  { busy, unfocused }: { busy: boolean; unfocused: boolean },
  { find, land }: { find: (held: Held) => Found | undefined; land: (found: Found) => void },
): Held | undefined {
  const found = held === undefined || busy ? undefined : find(held);

  if (found === undefined) {
    return held;
  }

  if (unfocused) {
    land(found);
  }

  return undefined;
}

function sameFile(file: OpenFile, other: Pick<Open, "group" | "path">): boolean {
  return file.group === other.group && file.path === other.path;
}

// How the place compares with the other in the view's order: below 0 before it, above 0 after it.
function compared([file, bar]: BarAt, [otherFile, otherBar]: BarAt): number {
  return file - otherFile || bar - otherBar;
}

function inOrder(stops: Iterable<Stop>): Stop[] {
  return [...stops].toSorted((stop, other) => compared(stop.at, other.at));
}

function indexIn(stops: readonly Stop[], at: BarAt): number {
  return stops.findIndex((stop) => compared(stop.at, at) === 0);
}

function isHunk({ at: [, bar] }: Stop): boolean {
  return bar >= 0;
}

// The bars, in order, that focus moves on to once an action is done: the hunks', and those of files
// shown without hunks.
function landings(stops: readonly Stop[]): Stop[] {
  return stops.filter((stop) => isHunk(stop) || stop.bare === true);
}

// Adds the item to the items, until the returned function is called.
function added<Item>(items: Set<Item>, item: Item): () => void {
  items.add(item);

  return () => {
    items.delete(item);
  };
}

function moveTo(stop: Stop | undefined): void {
  stop?.focus();
  stop?.show();
}

// A file the keys opened, and which of its bars focus moves to once it shows: its own, its last,
// or its first hunk's, or its own if it has none. Or a group they opened, whose first file's first
// hunk focus moves to once its view shows.
type Pending =
  | { file: OpenFile; bar: "file" | "last" | "entry" }
  | { group: GroupName; bar: "first" };

// Whether the view is of the whole group, rather than of a file or files selected in it.
function ofGroup(view: Open, group: GroupName): boolean {
  return view.group === group && view.path === undefined && !("paths" in view);
}

export function keyboardFocus(): KeyboardFocus {
  const rows = new Map<string, Focusable>();
  const headings = new Map<GroupName, Focusable>();
  const filters = new Set<Focusable>();
  const listings = new Set<ListedFiles>();
  const stops = new Set<Stop>();
  const crossings = new Set<object>();
  // The index of the place held among the landings, while one is.
  let held: number | undefined;
  let pending: Pending | undefined;

  function ofFile(file: OpenFile): Stop[] {
    return inOrder(stops).filter((stop) => sameFile(stop.file, file));
  }

  // The file's first hunk, or its bar if it has none.
  function entry(file: OpenFile): Stop | undefined {
    const shown = ofFile(file);

    return shown.find(isHunk) ?? shown.find(({ at: [, bar] }) => bar === fileBar);
  }

  // The first hunk of the view's first file, or that file's bar if it has none.
  function first(): Stop | undefined {
    const [shown] = inOrder(stops);

    return shown === undefined ? undefined : entry(shown.file);
  }

  // Opens the file listed after the file, or before it, with focus on the bar once it shows, while
  // the view crosses files.
  function cross(file: OpenFile, step: 1 | -1, bar: "file" | "last"): void {
    for (const listing of crossings.size > 0 ? listings : []) {
      const next = listing.listed(file, step);

      if (next !== undefined) {
        pending = { file: next, bar };
        listing.open(next);
      }
    }
  }

  // Moves focus to the next bar, or past the view's ends from the one at the place, if there's none.
  function moveOn(next: Stop | undefined, at: BarAt, step: 1 | -1, bar: "file" | "last"): void {
    pending = undefined;

    if (next !== undefined) {
      moveTo(next);

      return;
    }

    const from = inOrder(stops).find((stop) => compared(stop.at, at) === 0);

    if (from !== undefined) {
      cross(from.file, step, bar);
    }
  }

  function toRow(file: OpenFile): void {
    pending = undefined;
    rows.get(shownFileKey(file))?.focus();
  }

  function toHeading(group: GroupName): void {
    pending = undefined;
    headings.get(group)?.focus();
  }

  return {
    addRow: (file, row) => {
      rows.set(shownFileKey(file), row);

      return () => {
        rows.delete(shownFileKey(file));
      };
    },
    addHeading: (group, heading) => {
      headings.set(group, heading);

      return () => {
        headings.delete(group);
      };
    },
    addFilter: (filter) => added(filters, filter),
    addListed: (listed) => added(listings, listed),
    addStop: (stop) => {
      const remove = added(stops, stop);

      if (pending?.bar === "file" && sameFile(pending.file, stop.file) && stop.at[1] === fileBar) {
        pending = undefined;
        moveTo(stop);
      }

      return remove;
    },
    addCrossing: () => added(crossings, {}),
    toRow,
    toHeading,
    toStop: (stop) => {
      if (stop?.path !== undefined) {
        toRow({ group: stop.group, path: stop.path });
      } else if (stop !== undefined) {
        toHeading(stop.group);
      }
    },
    toFilter: () => {
      pending = undefined;

      for (const filter of filters) {
        filter.focus();
      }
    },
    toFile: (file, open) => {
      const target = entry(file);

      if (target === undefined) {
        pending = { file, bar: "entry" };
        open();
      } else {
        pending = undefined;
        moveTo(target);
      }
    },
    toGroup: (group, open) => {
      pending = open ? undefined : { group, bar: "first" };
      moveTo(open ? first() : undefined);
    },
    toBarBy: (at, step) => {
      const shown = inOrder(stops);
      const index = indexIn(shown, at);

      moveOn(
        index === -1 ? undefined : shown[index + step],
        at,
        step,
        step === 1 ? "file" : "last",
      );
    },
    toFileBy: (at, step) => {
      const bars = inOrder(stops).filter((stop) => stop.at[1] === fileBar);

      const next =
        step === 1
          ? bars.find((stop) => compared(stop.at, at) > 0)
          : bars.findLast((stop) => compared(stop.at, at) < 0);

      moveOn(next, at, step, "file");
    },
    toLinesBy: (at, step) => {
      pending = undefined;
      const hunks = inOrder(stops).filter(isHunk);
      const index = indexIn(hunks, at);
      const next = index === -1 ? undefined : hunks[index + step];

      next?.focus();
      next?.enter?.(step === 1 ? "first" : "last");
    },
    toBarAt: (at) => {
      pending = undefined;
      inOrder(stops)
        .find((stop) => compared(stop.at, at) === 0)
        ?.focus();
    },
    abandon: () => {
      pending = undefined;
    },
    hold: (at) => {
      held = landings(inOrder(stops)).filter((stop) => compared(stop.at, at) < 0).length;
    },
    settle: (busy, unfocused) => {
      const shown = landings(inOrder(stops));

      held = settled(
        held,
        { busy, unfocused },
        {
          // The one in the place held, or the last, while the view shows any.
          find: (index) => shown.at(Math.min(index, shown.length - 1)),
          land: (stop) => {
            stop.focus();
          },
        },
      );
    },
    shown: (view) => {
      if (pending?.bar === "last" || pending?.bar === "entry") {
        const { file, bar } = pending;

        if (sameFile(file, view)) {
          pending = undefined;
          moveTo(bar === "last" ? ofFile(file).at(-1) : entry(file));
        }
      }

      if (pending?.bar === "first" && ofGroup(view, pending.group)) {
        pending = undefined;
        moveTo(first());
      }
    },
  };
}

// The panel's, which its sidebar and diff share.
export const KeyboardFocusContext = createContext(keyboardFocus());
