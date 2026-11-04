import * as fc from "fast-check";

import { keptPlace } from "../client/place";
import type { KeptPlace, ShownFile, ViewPage } from "../client/place";

export const lineHeight = 20;
export const barHeight = 30;

// How many pixels above the top of the view the top of the line at its top is.
export const intoLine = fc.integer({ min: 0, max: lineHeight - 1 });

// An element of a page, with an id or without one, and as tall as it says.
export interface Row {
  id?: string;
  height: number;
}

export interface FakePage extends ViewPage {
  // What the view shows, one under the other from its top, scrolled as far as they go.
  rows: Row[];
}

function heightOf(rows: readonly Row[]): number {
  return rows.reduce((height, row) => height + row.height, 0);
}

// The view on the page is as short as a view can be, and scrolls no further than its rows go, as a
// page leaves a view once what it shows gets shorter.
export function fakePage(): FakePage {
  let scrolled = 0;

  const page: FakePage = {
    rows: [],
    ids: () => page.rows.flatMap(({ id }) => (id === undefined ? [] : [id])),
    offsetOf: (id) => {
      const index = page.rows.findIndex((row) => id !== undefined && row.id === id);

      return index === -1 ? undefined : heightOf(page.rows.slice(0, index)) - page.scrollTop();
    },
    scrollTop: () => {
      scrolled = Math.min(scrolled, heightOf(page.rows));

      return scrolled;
    },
    atEnd: () => page.scrollTop() === heightOf(page.rows),
    scrollBy: (distance) => {
      scrolled = Math.max(page.scrollTop() + distance, 0);
    },
  };

  return page;
}

export interface View {
  kept: KeptPlace;
  // Has the place kept as once all of what the view shows has rendered, with whether an action is
  // running.
  render: (busy?: boolean) => void;
}

export function viewOn(page: ViewPage): View {
  const tasks: (() => void)[] = [];

  const kept = keptPlace(page, (task) => {
    tasks.push(task);
  });

  return {
    kept,
    render: (busy = false) => {
      kept.settle(busy);

      for (const task of tasks.splice(0)) {
        task();
      }
    },
  };
}

// The file at the path, shown at the container with the lines, its lines' ids under the
// container's.
export function fileOf(container: string, path: string, lines: readonly string[]): ShownFile {
  return { path, lines, ids: lines.map((_, index) => `${container}:${index}`) };
}

// The rows of a file's diff in a view: in a group's view, the element at its start, under the
// file's bar, then a hunk's bar, which has an id that marks no place, then the file's lines.
export function rowsOf(file: ShownFile, start?: string): Row[] {
  return [
    ...(start === undefined ? [] : [{ height: barHeight }, { id: start, height: 0 }]),
    { id: `bar of ${file.path}`, height: barHeight },
    ...file.ids.map((id) => ({ id, height: lineHeight })),
  ];
}

// The id of the element of the file's line with the text.
function idOfLine(file: ShownFile | undefined, text: string): string | undefined {
  return file?.ids[file.lines.indexOf(text)];
}

export function offsetOfLine(
  page: ViewPage,
  file: ShownFile | undefined,
  text: string,
): number | undefined {
  return page.offsetOf(idOfLine(file, text));
}

// Scrolls the page to show the element with the id at the view's top, `into` pixels into it.
export function scrollToElement(page: ViewPage, id: string | undefined, into: number): void {
  const offset = page.offsetOf(id);

  if (offset === undefined) {
    throw new Error(`${String(id)} isn't on the page.`);
  }

  page.scrollBy(offset + into);
}

export function scrollToLine(
  page: ViewPage,
  file: ShownFile | undefined,
  text: string,
  into: number,
): void {
  scrollToElement(page, idOfLine(file, text), into);
}

// What stops each view's group's files from being shown, as of when they last were.
const shownGroups = new WeakMap<KeptPlace, (() => void)[]>();

// Shows a group's files, each by its path and lines, in a group's view, under the id of the file's
// index in it, and the element at the start of each one's diff, with the id `start:<index>`, in
// place of those it showed before, as the view does once it renders them again.
export function showGroup(
  page: FakePage,
  { kept }: View,
  files: readonly (readonly [string, readonly string[]])[],
): ShownFile[] {
  const shown = files.map(([path, lines], index) => fileOf(`view:${index}`, path, lines));

  page.rows = shown.flatMap((file, index) => rowsOf(file, `start:${index}`));

  for (const stop of shownGroups.get(kept) ?? []) {
    stop();
  }

  shownGroups.set(
    kept,
    shown.map((file, index) => kept.show(`view:${index}`, file)),
  );

  kept.showStarts(new Map(shown.map(({ path }, index) => [path, `start:${index}`])));

  return shown;
}

export interface ScrolledView extends View {
  page: FakePage;
  // Shows the lines instead, as once an agent changes them.
  change: (lines: readonly string[]) => ShownFile;
}

// A view on a page showing a file's lines, with one of them at its top, `into` pixels into it.
export function scrolledTo(lines: readonly string[], top: string, into = 5): ScrolledView {
  const page = fakePage();
  const view = viewOn(page);

  function change(changed: readonly string[]): ShownFile {
    const file = fileOf("view:0", "a.txt", changed);

    page.rows = rowsOf(file);
    view.kept.show("view:0", file);

    return file;
  }

  const shown = change(lines);

  view.render();
  scrollToLine(page, shown, top, into);
  view.kept.scrolled();

  return { ...view, page, change };
}
