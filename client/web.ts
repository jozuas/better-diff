// Stryker disable all: this module imports react-native, which Vitest can't load.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import type { Point } from "./menu";
import { topPlace } from "./place";
import type { Place } from "./place";
import { markOf, selectedLines, selectedRange, stillSelected } from "./selection";
import type { LineRange, SelectedLines, ShownFiles } from "./selection";
import { shiftStep } from "./shift";
import type { Keys } from "./shift";

// This plugin typechecks without the DOM library. Declare only what this module uses.
interface PageNode {
  readonly nodeType: number;
}

interface PageMouseEvent {
  readonly clientX: number;
  readonly clientY: number;
  preventDefault: () => void;
}

interface PageKeyboardEvent extends Readonly<Keys> {
  preventDefault: () => void;
}

// What an element's listeners hear, by the event they listen for.
interface PageEvents {
  dblclick: PageMouseEvent;
  contextmenu: PageMouseEvent;
  keydown: PageKeyboardEvent;
}

interface PageElement extends PageNode {
  readonly id: string;
  readonly parentElement: PageElement | null;
  scrollTop: number;
  readonly style: {
    cursor: string;
    overflowAnchor: string;
    paddingRight: string;
    userSelect: string;
    width: string;
  };
  getBoundingClientRect: () => { readonly top: number; readonly width: number };
  addEventListener: <Type extends keyof PageEvents>(
    type: Type,
    listener: (event: PageEvents[Type]) => void,
  ) => void;
  removeEventListener: <Type extends keyof PageEvents>(
    type: Type,
    listener: (event: PageEvents[Type]) => void,
  ) => void;
  contains: (node: PageNode | null) => boolean;
  querySelectorAll: (selectors: string) => Iterable<PageElement>;
}

interface PageRange {
  readonly startContainer: PageNode;
  readonly startOffset: number;
  readonly endContainer: PageNode;
  readonly endOffset: number;
  selectNodeContents: (node: PageNode) => void;
  setStart: (node: PageNode, offset: number) => void;
  setEnd: (node: PageNode, offset: number) => void;
  toString: () => string;
}

interface PageSelection {
  readonly isCollapsed: boolean;
  readonly rangeCount: number;
  readonly anchorNode: PageNode | null;
  getRangeAt: (index: number) => PageRange;
  containsNode: (node: PageNode, partly: boolean) => boolean;
  removeAllRanges: () => void;
}

declare const document: {
  addEventListener: (type: "selectionchange", listener: () => void) => void;
  removeEventListener: (type: "selectionchange", listener: () => void) => void;
  getSelection: () => PageSelection | null;
  querySelector: (selectors: string) => PageElement | null;
  createRange: () => PageRange;
  readonly body: PageElement;
};

declare const CSS: { escape: (identifier: string) => string };

// Whether the selection has some of the element's text, or all of it, as it has of an empty
// element it spans. A selection can end at the start of an element, as a triple click's does at
// the start of the next line's, or start at its end, and then has none of its text.
function touches(selection: PageSelection, element: PageElement): boolean {
  if (selection.containsNode(element, false)) {
    return true;
  }

  if (!selection.containsNode(element, true)) {
    return false;
  }

  const range = selection.getRangeAt(0);
  const part = document.createRange();

  part.selectNodeContents(element);

  if (element.contains(range.startContainer)) {
    part.setStart(range.startContainer, range.startOffset);
  }

  if (element.contains(range.endContainer)) {
    part.setEnd(range.endContainer, range.endOffset);
  }

  return part.toString() !== "";
}

// Calls the listener whenever the page's text selection changes, until the returned function is
// called, with the ids of the elements inside the element with the id `container` that have one and
// whose text the selection touches, in the page's order, and of the one it starts in, or "" if it
// starts in none.
function onSelection(
  container: string,
  listener: (touched: string[], anchor: string) => void,
): () => void {
  if (Platform.OS !== "web") {
    return () => {};
  }

  function read(): void {
    const selection = document.getSelection();
    const root = document.querySelector(`#${CSS.escape(container)}`);

    if (
      selection === null ||
      root === null ||
      selection.isCollapsed ||
      selection.rangeCount === 0
    ) {
      listener([], "");

      return;
    }

    const elements = [...root.querySelectorAll("[id]")];

    listener(
      elements.flatMap((element) => (touches(selection, element) ? [element.id] : [])),
      elements.find((element) => element.contains(selection.anchorNode))?.id ?? "",
    );
  }

  document.addEventListener("selectionchange", read);

  return () => {
    document.removeEventListener("selectionchange", read);
  };
}

export function clearSelection(): void {
  if (Platform.OS === "web") {
    document.getSelection()?.removeAllRanges();
  }
}

// The lines of the diffs in the element with the id `view` that the page's text selection touches,
// while the file they're in shows what it did when they were selected, as `shown` says. Once it
// shows something else, the selection is cleared, since the lines it touches then can be others,
// which an action on the lines would act on.
export function useSelectedLines(view: string, shown: ShownFiles): LineRange | undefined {
  const [selected, setSelected] = useState<SelectedLines>();
  const latest = useRef(shown);

  useLayoutEffect(() => {
    latest.current = shown;
  });

  useEffect(
    () =>
      onSelection(view, (touched, anchor) => {
        const range = selectedRange(view, touched, anchor);

        setSelected((before) => selectedLines(before, range, latest.current));
      }),
    [view],
  );

  const range = stillSelected(selected, shown);
  const moved = selected !== undefined && range === undefined;

  useLayoutEffect(() => {
    if (moved) {
      clearSelection();
    }
  }, [moved]);

  return range;
}

// How far below the top of the element with the id `container` the top of the element with the id
// `target` is, if both are on the page.
export function offsetIn(container: string, target: string): number | undefined {
  if (Platform.OS !== "web") {
    return undefined;
  }

  const scroller = document.querySelector(`#${CSS.escape(container)}`);
  const element = document.querySelector(`#${CSS.escape(target)}`);

  if (scroller === null || element === null) {
    return undefined;
  }

  return element.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
}

// Scrolls the element with the id `container` down by the distance, or up by a negative one, as
// far as it goes.
function scrollBy(container: string, distance: number): void {
  const scroller =
    Platform.OS === "web" ? document.querySelector(`#${CSS.escape(container)}`) : null;

  if (scroller !== null) {
    scroller.scrollTop += distance;
  }
}

// Scrolls the element with the id `container`, as far as it goes, to show the top of the element
// with the id `target` `offset` below its top.
export function scrollToOffset(container: string, target: string, offset: number): void {
  const current = offsetIn(container, target);

  if (current !== undefined) {
    scrollBy(container, current - offset);
  }
}

// The places of what the elements of the view with the id mark, in the page's order.
function placesIn(view: string): Place[] {
  const scroller = Platform.OS === "web" ? document.querySelector(`#${CSS.escape(view)}`) : null;

  if (scroller === null) {
    return [];
  }

  const { top } = scroller.getBoundingClientRect();

  return [...scroller.querySelectorAll("[id]")].flatMap((element) => {
    const mark = markOf(view, element.id);

    return mark === undefined
      ? []
      : [{ id: mark, offset: element.getBoundingClientRect().top - top }];
  });
}

// Holds the place of what the view with the id shows at its top, by the line, hunk or file's diff
// it's in, from when the returned function is called until `shown` changes, when the view scrolls to
// show that in the same place again.
export function useHeldPlace(view: string, shown: string): () => void {
  const held = useRef<{ place: Place; shown: string } | undefined>(undefined);

  useLayoutEffect(() => {
    const hold = held.current;

    if (hold !== undefined && hold.shown !== shown) {
      held.current = undefined;

      const now = placesIn(view).find(({ id }) => id === hold.place.id);

      if (now !== undefined) {
        scrollBy(view, now.offset - hold.place.offset);
      }
    }
  }, [view, shown]);

  return () => {
    const place = topPlace(placesIn(view));

    held.current = place === undefined ? undefined : { place, shown };
  };
}

// Scrolls the element with the id `container` up, if it has to, to show the top of the element with
// the id `target` just below the `margin` at its top, which a bar stuck there takes.
export function scrollUpTo(container: string, target: string, margin: number): void {
  const offset = offsetIn(container, target);

  if (offset !== undefined && offset < margin) {
    scrollToOffset(container, target, margin);
  }
}

// Has the element with the id keep its scroll position when what it shows changes size, rather than
// keep what it shows in place, as browsers that anchor scrolling do: they move a view that scrolls
// itself to what takes the place of something an action removes back to what was before it.
export function stopScrollAnchoring(id: string): void {
  if (Platform.OS !== "web") {
    return;
  }

  const element = document.querySelector(`#${CSS.escape(id)}`);

  if (element !== null) {
    element.style.overflowAnchor = "none";
  }
}

// Has the element with the id show the cursor for resizing what's either side of it.
export function showResizeCursor(id: string): void {
  if (Platform.OS !== "web") {
    return;
  }

  const element = document.querySelector(`#${CSS.escape(id)}`);

  if (element !== null) {
    element.style.cursor = "col-resize";
  }
}

// Shows the cursor for resizing all over the page, which then selects no text, until the returned
// function is called: a separator dragged past the diff's text resizes what's beside it, rather
// than selecting the text.
export function resizing(): () => void {
  if (Platform.OS !== "web") {
    return () => {};
  }

  const { style } = document.body;
  const { cursor, userSelect } = style;

  style.cursor = "col-resize";
  style.userSelect = "none";

  return () => {
    style.cursor = cursor;
    style.userSelect = userSelect;
  };
}

// Calls the listener on each event of the type in the element with the id, until the returned
// function is called.
function listen<Type extends keyof PageEvents>(
  id: string,
  type: Type,
  listener: (event: PageEvents[Type]) => void,
): () => void {
  const element = Platform.OS === "web" ? document.querySelector(`#${CSS.escape(id)}`) : null;

  element?.addEventListener(type, listener);

  return () => {
    element?.removeEventListener(type, listener);
  };
}

// Calls the listener on each double click on the element with the id, until the returned function is
// called.
export function onDoubleClick(id: string, listener: () => void): () => void {
  return listen(id, "dblclick", listener);
}

// Calls the listener with where the pointer is on each right click on the element with the id, in
// place of the page's own menu, until the returned function is called.
export function onContextMenu(id: string, listener: (point: Point) => void): () => void {
  return listen(id, "contextmenu", (event) => {
    event.preventDefault();
    listener({ x: event.clientX, y: event.clientY });
  });
}

// Calls the listener with how far each Shift+↓ or Shift+↑ in the element with the id moves the file
// a selection reaches, in place of scrolling, until the returned function is called.
export function onShiftArrow(id: string, listener: (step: 1 | -1) => void): () => void {
  return listen(id, "keydown", (event) => {
    const step = shiftStep(event);

    if (step !== undefined) {
      event.preventDefault();
      listener(step);
    }
  });
}

// What ids of elements laid over the end of the row they're in start with.
const overlay = "overlay";

// The id of an element laid over the end of the row it's in, from an id of its own.
export function overlayId(id: string): string {
  return `${overlay}${id}`;
}

// The width the element with the id takes to show all of its content, unwrapped and uncut, as it
// does without a width of its own, and each of its rows' content beside what's laid over the row's
// end rather than under it. Null without a page to measure it on.
export function fittingWidth(id: string): number | null {
  const element = Platform.OS === "web" ? document.querySelector(`#${CSS.escape(id)}`) : null;

  if (element === null) {
    return null;
  }

  const rows = [...element.querySelectorAll(`[id^="${overlay}"]`)].flatMap((laid) => {
    const row = laid.parentElement;

    return row === null
      ? []
      : [{ row, padding: row.style.paddingRight, room: laid.getBoundingClientRect().width }];
  });

  const { width } = element.style;

  for (const { row, room } of rows) {
    row.style.paddingRight = `${room}px`;
  }

  element.style.width = "max-content";

  const fitting = element.getBoundingClientRect().width;

  element.style.width = width;

  for (const { row, padding } of rows) {
    row.style.paddingRight = padding;
  }

  return Math.ceil(fitting);
}
