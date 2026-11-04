// Stryker disable all: this module imports react-native, which Vitest can't load.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { selectedLines, selectedRange, stillSelected } from "./selection";
import type { LineRange, SelectedLines, ShownFiles } from "./selection";

// This plugin typechecks without the DOM library. Declare only what this module uses.
interface PageNode {
  readonly nodeType: number;
  readonly parentElement: PageElement | null;
}

interface PageElement extends PageNode {
  readonly id: string;
  contains: (node: PageNode | null) => boolean;
}

interface PageRange {
  readonly startContainer: PageNode;
  readonly startOffset: number;
  readonly endContainer: PageNode;
  readonly endOffset: number;
  selectNodeContents: (node: PageNode) => void;
  setStart: (node: PageNode, offset: number) => void;
  setEnd: (node: PageNode, offset: number) => void;
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

// Calls the listener whenever the page's text selection changes, until the returned function is
// called, with the ids of the elements inside the element with the id `container` that have one and
// whose text the selection touches, in the page's order, and of the outermost one it starts in, or
// "" if it starts in none.
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

    const elements = selection.containsNode(root, true)
      ? inRange(root, selection.getRangeAt(0))
      : [];

    const anchor = selection.anchorNode === null ? [] : aroundNode(root, selection.anchorNode);

    listener(
      elements.flatMap((element) => (touches(selection, element) ? [element.id] : [])),
      anchor[0]?.id ?? "",
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
