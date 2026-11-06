import * as fc from "fast-check";

import { fileBar, keyboardFocus } from "../client/focus";
import type { BarAt, KeyboardFocus } from "../client/focus";
import type { GroupName } from "../client/groups";

// A bar of a diff, as the panel's keyboard focus has it.
type Stop = Parameters<KeyboardFocus["addStop"]>[0];

// A panel's keyboard focus, and what's done to what it moves focus to.
interface Recorded {
  done: string[];
  focus: KeyboardFocus;
  // A bar at the place, of the file at the path in the group.
  stop: (place: BarAt, path?: string, group?: GroupName) => Stop;
  // Adds bars at the places, of files named by their indices.
  add: (...places: BarAt[]) => (() => void)[];
  // A row, heading or filter by the name, which is done once focus moves to it.
  named: (name: string) => { focus: () => void };
}

// A panel's keyboard focus, and what's been done to what it moves focus to, in order: each bar's by
// its place, and each row's, heading's and filter's by its name.
export function recorded(): Recorded {
  const done: string[] = [];
  const focus = keyboardFocus();

  function stop(place: BarAt, path = String(place[0]), group: GroupName = "modified"): Stop {
    const name = place.join(",");

    return {
      file: { group, path },
      at: place,
      focus: () => {
        done.push(`focus ${name}`);
      },
      show: () => {
        done.push(`show ${name}`);
      },
      enter: (end) => {
        done.push(`enter ${name} ${end}`);
      },
    };
  }

  function add(...places: BarAt[]): (() => void)[] {
    return places.map((place) => focus.addStop(stop(place)));
  }

  function named(name: string) {
    return {
      focus: () => {
        done.push(name);
      },
    };
  }

  return { done, focus, stop, add, named };
}

export function shown(place: BarAt): string[] {
  return [`focus ${place.join(",")}`, `show ${place.join(",")}`];
}

// The places of a view's bars, each a file's index and the bar's own in the file, in the order
// they're added: the file's bar, its mode change's and its hunks'.
export const places = fc.uniqueArray(fc.tuple(fc.nat(3), fc.integer({ min: fileBar, max: 3 })), {
  selector: (place) => place.join(","),
  minLength: 1,
});
