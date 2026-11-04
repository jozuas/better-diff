import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";
import { keptLine } from "./kept-lines";
import type { Unchanged } from "./lines";
import { lineId, unchangedLineId } from "./selection";

type Hunk = RpcOutput<typeof diffRpc>["hunks"][number];

// What a view shows of one of its files' diffs, a new one whenever what it shows changes: its diff,
// or whether the entire file shows.
export interface ShownFile {
  path: string;
  // The text of each of its lines, in order, by which a line is found again once it shows others.
  lines: readonly string[];
  // The id of each line's element.
  ids: readonly string[];
}

// What the view shows of a file's diff at the container, the id it gives the file's: each hunk's
// lines, and while the entire file shows, the unchanged lines before the first and after each.
export function shownFileOf(
  path: string,
  hunks: readonly Hunk[],
  unchanged: Unchanged,
  container: string,
): ShownFile {
  const shown = [
    ...unchanged.before.map((line) => ({ text: line.text, id: unchangedLineId(container, line) })),
    ...hunks.flatMap(({ lines }, hunk) => [
      ...lines.map(({ text }, line) => ({ text, id: lineId(container, hunk, line) })),
      ...(unchanged.after[hunk] ?? []).map((line) => ({
        text: line.text,
        id: unchangedLineId(container, line),
      })),
    ]),
  ];

  return { path, lines: shown.map(({ text }) => text), ids: shown.map(({ id }) => id) };
}

// The page, as a view on it is read and scrolled. Side by side, it reads a line on either side as
// the side with focus has it.
export interface ViewPage {
  // The ids of the elements in the view that have one, in the page's order.
  ids: () => readonly string[];
  // How far below the view's top the top of the element with the id is, if there's one in it.
  offsetOf: (id: string | undefined) => number | undefined;
  // How far the view is scrolled down.
  scrollTop: () => number;
  // Whether it's scrolled as far down as it goes, as the page leaves it once what it shows gets
  // shorter than how far down it was.
  atEnd: () => boolean;
  // Scrolls the view down by the distance, or up by a negative one, as far as it goes.
  scrollBy: (distance: number) => void;
}

// What an element of a view marks the place of: by its file's path, one of the lines the file shows,
// by them and its index among them, or else the start of the file's diff.
interface Mark {
  path: string;
  line?: { lines: readonly string[]; index: number };
}

// Where what an element marks was, while the view was scrolled down as far as `scrollTop` says, and
// showed the starts of the files' diffs that `starts` says.
interface Anchor {
  mark: Mark;
  offset: number;
  scrollTop: number;
  starts: ReadonlyMap<string, string>;
}

// The place of the element with the id, which the diff shown at the container held for while it
// showed what `file` says, and the view was scrolled down as far as `scrollTop` says.
interface Held {
  container: string;
  id: string;
  offset: number;
  file: ShownFile | undefined;
  scrollTop: number;
}

// Keeps what a view shows at its top in place as what it shows changes, as when an agent's change
// adds lines above it or takes them away.
export interface KeptPlace {
  // Has the view keep the places of the lines of the file whose diff it shows at the container, the
  // id it gives the file's, until the returned function is called.
  show: (container: string, file: ShownFile) => () => void;
  // In a group's view, the id of the element at the start of each of its files' diffs, by the
  // file's path.
  showStarts: (starts: ReadonlyMap<string, string>) => void;
  // Holds the place of the element with the id in the diff shown at the container until the diff
  // shows something else, when the view scrolls to show it in the same place again, rather than
  // what it showed at its top. It's held until an action that's `busy` is done, so that an agent's
  // change shown before the action's doesn't end it, unless the view is scrolled first.
  hold: (container: string, id: string) => void;
  // Once the caller renders what the view shows, with whether an action is running, the view
  // shows what it showed at its top in the same place, or once that's gone, what takes its place,
  // unless the diff a place is held in shows something else, or the view was scrolled since. While
  // an action runs, and as it ends, the view stays as the action leaves it.
  settle: (busy: boolean) => void;
  // Hears the view scroll.
  scrolled: () => void;
}

// Of the ids of elements, in the page's order, that of the last at or above the view's top, or else
// the first's.
function topOf(ids: readonly string[], offsetOf: ViewPage["offsetOf"]): string | undefined {
  let low = 0;
  let high = ids.length - 1;
  let top = ids[0];

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);

    if ((offsetOf(ids[middle]) ?? 0) <= 0) {
      top = ids[middle];
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return top;
}

// The marks of the files' lines and of their starts, by their elements' ids.
function marksOf(
  files: Iterable<ShownFile>,
  starts: ReadonlyMap<string, string>,
): Map<string | undefined, Mark> {
  const marks = new Map<string | undefined, Mark>();

  for (const [path, id] of starts) {
    marks.set(id, { path });
  }

  for (const { path, lines, ids } of files) {
    for (const [index, id] of ids.entries()) {
      marks.set(id, { path, line: { lines, index } });
    }
  }

  return marks;
}

// Keeps the place of a view on the page, settling once `schedule` runs a task, after all of what
// the view shows has rendered.
export function keptPlace(page: ViewPage, schedule: (task: () => void) => void): KeptPlace {
  const files = new Map<string, ShownFile>();
  let starts: ReadonlyMap<string, string> = new Map();
  // The marks, until a file or the files' starts are shown, and the ids of the elements with them,
  // in the page's order, until then or until the view settles, as what's shown is laid out anew.
  let marks: Map<string | undefined, Mark> | undefined;
  let order: string[] | undefined;
  let anchor: Anchor | undefined;
  let held: Held | undefined;
  // Stryker disable next-line BooleanLiteral: settle sets it before settling reads it.
  let busy = false;
  let wasBusy = false;
  let settling = false;

  function changed(): void {
    marks = undefined;
    order = undefined;
  }

  function capture(): Anchor | undefined {
    marks ??= marksOf(files.values(), starts);

    const known = marks;

    order ??= page.ids().filter((id) => known.has(id));

    const id = topOf(order, page.offsetOf);
    const mark = known.get(id);

    return mark === undefined
      ? undefined
      : { mark, offset: page.offsetOf(id) ?? 0, scrollTop: page.scrollTop(), starts };
  }

  function scrollTo(id: string | undefined, offset: number): void {
    const now = page.offsetOf(id);

    if (now !== undefined) {
      page.scrollBy(now - offset);
    }
  }

  // Whether the view is scrolled down as far as it was when the anchor was found, or up from there
  // only as far as it goes now.
  function unscrolled({ scrollTop }: Anchor): boolean {
    const now = page.scrollTop();

    return now <= scrollTop && (now === scrollTop || page.atEnd());
  }

  // The id of the element of what the anchor marks, as the view shows it now, or once the view shows
  // none of its file's lines, of the start of its file's diff, or else of the next file's still there.
  function idOf({ mark: { path, line }, starts: then }: Anchor): string | undefined {
    const file = [...files.values()].find((shown) => shown.path === path);

    if (line !== undefined && file !== undefined) {
      return file.ids[keptLine(line.lines, file.lines, line.index)];
    }

    const paths = [...then.keys()];

    return paths
      .slice(paths.indexOf(path))
      .map((next) => starts.get(next))
      .find((id) => id !== undefined);
  }

  function settleNow(): void {
    settling = false;

    const place = held;
    const moved = place !== undefined && files.get(place.container) !== place.file;

    if (moved) {
      scrollTo(place.id, place.offset);
    } else if (!busy && !wasBusy && anchor !== undefined && unscrolled(anchor)) {
      scrollTo(idOf(anchor), anchor.offset);
    }

    held =
      place === undefined || (!busy && (moved || wasBusy))
        ? undefined
        : { ...place, file: files.get(place.container), scrollTop: page.scrollTop() };

    wasBusy = busy;
    order = undefined;
    anchor = capture();
  }

  return {
    show: (container, file) => {
      files.set(container, file);
      changed();

      return () => {
        files.delete(container);
      };
    },
    showStarts: (shown) => {
      starts = shown;
      changed();
    },
    hold: (container, id) => {
      const offset = page.offsetOf(id);

      held =
        offset === undefined
          ? undefined
          : { container, id, offset, file: files.get(container), scrollTop: page.scrollTop() };
    },
    settle: (running) => {
      busy = running;

      if (!settling) {
        settling = true;
        schedule(settleNow);
      }
    },
    scrolled: () => {
      if (held !== undefined && page.scrollTop() !== held.scrollTop) {
        held = undefined;
      }

      anchor = capture();
    },
  };
}
