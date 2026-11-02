// Stryker disable all: this module imports react-native, which Vitest can't load.
import { Platform } from "react-native";

import type { Point } from "./menu";

// This plugin typechecks without the DOM library. Declare only what this module uses.
interface PageNode {
  readonly nodeType: number;
}

interface PageMouseEvent {
  readonly clientX: number;
  readonly clientY: number;
  preventDefault: () => void;
}

// What an element's listeners hear, by the event they listen for.
interface PageEvents {
  dblclick: PageMouseEvent;
  contextmenu: PageMouseEvent;
}

interface PageElement extends PageNode {
  readonly id: string;
  scrollTop: number;
  readonly style: { cursor: string; userSelect: string; width: string };
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

declare const window: {
  addEventListener: (type: "focus", listener: () => void) => void;
  removeEventListener: (type: "focus", listener: () => void) => void;
};

declare const document: {
  addEventListener: (type: "selectionchange", listener: () => void) => void;
  removeEventListener: (type: "selectionchange", listener: () => void) => void;
  getSelection: () => PageSelection | null;
  querySelector: (selectors: string) => PageElement | null;
  createRange: () => PageRange;
  readonly body: PageElement;
};

declare const CSS: { escape: (identifier: string) => string };

// Calls the listener whenever the app's window gains focus, as on switching back to it from
// another app, until the returned function is called. Only on the web, where the desktop app runs.
export function onWindowFocus(listener: () => void): () => void {
  if (Platform.OS !== "web") {
    return () => {};
  }

  window.addEventListener("focus", listener);

  return () => {
    window.removeEventListener("focus", listener);
  };
}

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
export function onSelection(
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

// Scrolls the element with the id `container` up, if it has to, to show the top of the element with
// the id `target` just below the `margin` at its top, which a bar stuck there takes.
export function scrollUpTo(container: string, target: string, margin: number): void {
  if (Platform.OS !== "web") {
    return;
  }

  const scroller = document.querySelector(`#${CSS.escape(container)}`);
  const element = document.querySelector(`#${CSS.escape(target)}`);

  if (scroller === null || element === null) {
    return;
  }

  const hidden =
    scroller.getBoundingClientRect().top + margin - element.getBoundingClientRect().top;

  if (hidden > 0) {
    scroller.scrollTop -= hidden;
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

// Calls the listener on each double click on the element with the id, until the returned function is
// called.
export function onDoubleClick(id: string, listener: () => void): () => void {
  const element = Platform.OS === "web" ? document.querySelector(`#${CSS.escape(id)}`) : null;

  element?.addEventListener("dblclick", listener);

  return () => {
    element?.removeEventListener("dblclick", listener);
  };
}

// Calls the listener with where the pointer is on each right click on the element with the id, in
// place of the page's own menu, until the returned function is called.
export function onContextMenu(id: string, listener: (point: Point) => void): () => void {
  const element = Platform.OS === "web" ? document.querySelector(`#${CSS.escape(id)}`) : null;

  function open(event: PageMouseEvent): void {
    event.preventDefault();
    listener({ x: event.clientX, y: event.clientY });
  }

  element?.addEventListener("contextmenu", open);

  return () => {
    element?.removeEventListener("contextmenu", open);
  };
}

// The width the element with the id takes to show all of its content, unwrapped and uncut, as it
// does without a width of its own. Null without a page to measure it on.
export function fittingWidth(id: string): number | null {
  const element = Platform.OS === "web" ? document.querySelector(`#${CSS.escape(id)}`) : null;

  if (element === null) {
    return null;
  }

  const { width } = element.style;

  element.style.width = "max-content";

  const fitting = element.getBoundingClientRect().width;

  element.style.width = width;

  return Math.ceil(fitting);
}
