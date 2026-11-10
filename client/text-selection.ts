// Stryker disable all: this module imports react-native, which Vitest can't load.
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

import { lineId, selectedLines, selectedRange, stillSelected } from "./selection";
import type { LineRange, SelectedLines, ShownFiles } from "./selection";
import type { Focus, Side } from "./side-by-side";
import { useLatest } from "./web";

// This plugin typechecks without the DOM library. Declare only what this module uses.
interface PageNode {
  readonly nodeType: number;
  readonly parentElement: PageElement | null;
}

interface PageElement extends PageNode {
  readonly id: string;
  contains: (node: PageNode | null) => boolean;
  getBoundingClientRect: () => { readonly top: number };
}

interface PageRange {
  readonly startContainer: PageNode;
  readonly startOffset: number;
  readonly endContainer: PageNode;
  readonly endOffset: number;
  selectNodeContents: (node: PageNode) => void;
  setStart: (node: PageNode, offset: number) => void;
  setEnd: (node: PageNode, offset: number) => void;
  setStartBefore: (node: PageNode) => void;
  setEndAfter: (node: PageNode) => void;
  // Whether the point is before the range, -1, in it, 0, or after it, 1.
  comparePoint: (node: PageNode, offset: number) => number;
  toString: () => string;
}

// Walks the elements under the element it's rooted at, in the page's order, from any node.
interface PageTreeWalker {
  currentNode: PageNode;
  nextNode: () => PageElement | null;
}

interface PageSelection {
  readonly isCollapsed: boolean;
  readonly rangeCount: number;
  readonly anchorNode: PageNode | null;
  readonly anchorOffset: number;
  readonly focusNode: PageNode | null;
  readonly focusOffset: number;
  getRangeAt: (index: number) => PageRange;
  containsNode: (node: PageNode, partly: boolean) => boolean;
  removeAllRanges: () => void;
  toString: () => string;
  setBaseAndExtent: (
    anchorNode: PageNode,
    anchorOffset: number,
    focusNode: PageNode,
    focusOffset: number,
  ) => void;
}

declare const document: {
  addEventListener: (type: "selectionchange", listener: () => void) => void;
  removeEventListener: (type: "selectionchange", listener: () => void) => void;
  getSelection: () => PageSelection | null;
  querySelector: (selectors: string) => PageElement | null;
  createRange: () => PageRange;
  createTreeWalker: (root: PageElement, whatToShow: number) => PageTreeWalker;
};

declare const CSS: { escape: (identifier: string) => string };

declare const NodeFilter: { readonly SHOW_ELEMENT: number };

// What an element's nodeType is.
const elementNode = 1;

function isElement(node: PageNode): node is PageElement {
  return node.nodeType === elementNode;
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

// The elements inside the root with ids that the node is in, or is, from the outermost.
function aroundNode(root: PageElement, node: PageNode): PageElement[] {
  const around: PageElement[] = [];

  for (
    let element = isElement(node) ? node : node.parentElement;
    element !== null && element !== root && root.contains(element);
    element = element.parentElement
  ) {
    if (element.id !== "") {
      around.unshift(element);
    }
  }

  return around;
}

// The elements inside the root with ids whose text the range can touch, in the page's order: those
// it starts in, and those after where it starts that start before it ends. Only those, rather than
// all of the root's, so that reading a selection takes as long as it is, not as the view.
function inRange(root: PageElement, range: PageRange): PageElement[] {
  const start = root.contains(range.startContainer) ? range.startContainer : root;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const after: PageElement[] = [];

  walker.currentNode = start;

  for (
    let next = walker.nextNode();
    next !== null && range.comparePoint(next, 0) <= 0;
    next = walker.nextNode()
  ) {
    if (next.id !== "") {
      after.push(next);
    }
  }

  return [...aroundNode(root, start), ...after];
}

// What the page's text selection touches inside the element with the id `container`: the ids of the
// elements inside it that have one and whose text it touches, in the page's order, and of the
// outermost one it starts in, or "" if it starts in none, and whether it was made from its end
// back to its start, as by dragging upwards.
interface Touched {
  touched: string[];
  anchor: string;
  backward: boolean;
}

const untouched: Touched = { touched: [], anchor: "", backward: false };

function touchedIn(container: string): Touched {
  const selection = Platform.OS === "web" ? document.getSelection() : null;
  const root = selection === null ? null : document.querySelector(`#${CSS.escape(container)}`);

  if (selection === null || root === null || selection.isCollapsed || selection.rangeCount === 0) {
    return untouched;
  }

  const range = selection.getRangeAt(0);
  const elements = selection.containsNode(root, true) ? inRange(root, range) : [];
  const anchor = selection.anchorNode === null ? [] : aroundNode(root, selection.anchorNode);

  return {
    touched: elements.flatMap((element) => (touches(selection, element) ? [element.id] : [])),
    anchor: anchor[0]?.id ?? "",
    backward:
      selection.anchorNode === range.endContainer && selection.anchorOffset === range.endOffset,
  };
}

// The lines of the diffs in the element with the id `view` that the page's text selection touches
// now, and whether it was made from its end back to its start.
export function selectedNow(view: string): { range: LineRange; backward: boolean } | undefined {
  const { touched, anchor, backward } = touchedIn(view);
  const range = selectedRange(view, touched, anchor);

  return range === undefined ? undefined : { range, backward };
}

// Calls the listener with what the page's text selection touches inside the element with the id
// `container` whenever it changes, until the returned function is called.
function onSelection(container: string, listener: (touched: Touched) => void): () => void {
  if (Platform.OS !== "web") {
    return () => {};
  }

  function read(): void {
    listener(touchedIn(container));
  }

  document.addEventListener("selectionchange", read);

  return () => {
    document.removeEventListener("selectionchange", read);
  };
}

// Calls the latest listener each time the page's text selection changes, while `listening`.
export function useSelectionChanges(listening: boolean, listener: () => void): void {
  const latest = useLatest(listener);

  useEffect(() => {
    if (Platform.OS !== "web" || !listening) {
      return () => {};
    }

    function changed(): void {
      latest.current();
    }

    document.addEventListener("selectionchange", changed);

    return () => {
      document.removeEventListener("selectionchange", changed);
    };
  }, [listening, latest]);
}

// The text the page's selection has, as copying it with the keyboard copies it.
export function selectedText(): string {
  return Platform.OS === "web" ? (document.getSelection()?.toString() ?? "") : "";
}

// The page's text selection as it is, which tells it apart from another, as of lines that say the
// same: the text it has, as copying it copies it, and where it starts and ends.
export interface SelectionMark {
  readonly text: string;
  readonly anchor: PageNode | null;
  readonly anchorOffset: number;
  readonly focus: PageNode | null;
  readonly focusOffset: number;
}

// The page's text selection as it is now, if it has any, though it can have no text, as one of
// empty lines has none.
export function selectionMark(): SelectionMark | undefined {
  const selection = Platform.OS === "web" ? document.getSelection() : null;

  return selection === null || selection.isCollapsed || selection.rangeCount === 0
    ? undefined
    : {
        text: selection.toString(),
        anchor: selection.anchorNode,
        anchorOffset: selection.anchorOffset,
        focus: selection.focusNode,
        focusOffset: selection.focusOffset,
      };
}

// Whether the page's text selection is still as it was when marked.
export function stillMarked(mark: SelectionMark): boolean {
  const now = selectionMark();

  return (
    now !== undefined &&
    now.text === mark.text &&
    now.anchor === mark.anchor &&
    now.anchorOffset === mark.anchorOffset &&
    now.focus === mark.focus &&
    now.focusOffset === mark.focusOffset
  );
}

function lineElement(container: string, hunk: number, line: number): PageElement | null {
  return document.querySelector(`#${CSS.escape(lineId(container, hunk, line))}`);
}

// Selects the lines of the hunk of the file with the id `container`, from the line at the index
// `anchor` to the one at `head`, on the side with focus in a side-by-side view, as dragging across
// them from the first to the other does, up the view if it's above.
export function selectLines(container: string, hunk: number, anchor: number, head: number): void {
  if (Platform.OS !== "web") {
    return;
  }

  const start = lineElement(container, hunk, Math.min(anchor, head));
  const end = lineElement(container, hunk, Math.max(anchor, head));
  const selection = document.getSelection();

  if (start === null || end === null || selection === null) {
    return;
  }

  const range = document.createRange();

  range.setStartBefore(start);
  range.setEndAfter(end);

  const { startContainer, startOffset, endContainer, endOffset } = range;

  if (anchor > head) {
    selection.setBaseAndExtent(endContainer, endOffset, startContainer, startOffset);
  } else {
    selection.setBaseAndExtent(startContainer, startOffset, endContainer, endOffset);
  }
}

// Of the lines of the hunk of the file with the id `container` at the indices, which shows nearest
// level with the line at the index `level`, in a side-by-side view: the first of them, if it can't
// be told.
export function nearestLevel(
  container: string,
  hunk: number,
  level: number,
  lines: readonly number[],
): number | undefined {
  function top(line: number, focused: boolean): number {
    return (
      document
        .querySelector(`#${CSS.escape(lineId(container, hunk, line, focused))}`)
        ?.getBoundingClientRect().top ?? 0
    );
  }

  if (Platform.OS !== "web") {
    return lines[0];
  }

  const from = top(level, true);
  let [nearest] = lines;

  for (const line of lines) {
    if (Math.abs(top(line, false) - from) < Math.abs(top(nearest ?? line, false) - from)) {
      nearest = line;
    }
  }

  return nearest;
}

export function clearSelection(): void {
  if (Platform.OS === "web") {
    document.getSelection()?.removeAllRanges();
  }
}

// Side by side, which side has focus: the one the pointer was last pressed on, the new version's
// until it is. Undefined inline. Pressing the pointer on the other side clears the selection, which
// the page's order of the sides' lines has that side's lines in, so the press starts a selection
// rather than dragging the one there was.
export function useFocus(sideBySide: boolean): Focus | undefined {
  const [side, setSide] = useState<Side>("new");

  return useMemo(
    () =>
      sideBySide
        ? {
            side,
            onFocus: (pressed) => {
              if (pressed !== side) {
                clearSelection();
              }

              setSide(pressed);
            },
          }
        : undefined,
    [sideBySide, side],
  );
}

// The lines of the diffs in the element with the id `view` that the page's text selection touches,
// while the file they're in shows what it did when they were selected, as `shown` says. Once it
// shows something else, the selection is cleared, since the lines it touches then can be others,
// which an action on the lines would act on.
export function useSelectedLines(view: string, shown: ShownFiles): LineRange | undefined {
  const [selected, setSelected] = useState<SelectedLines>();
  const latest = useLatest(shown);

  useEffect(
    () =>
      onSelection(view, ({ touched, anchor }) => {
        const range = selectedRange(view, touched, anchor);

        setSelected((before) => selectedLines(before, range, latest.current));
      }),
    [view, latest],
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
