// Stryker disable all: this module imports react-native, which Vitest can't load.
import type { RpcOutput } from "@getpaseo/plugin";
import { useContext, useId, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Platform } from "react-native";

import type { diffRpc } from "../shared/diff";
import { collapsedFile, findableLines, revealDistance, sectionsOf } from "./find";
import type { LinePage } from "./find";
import { FindContext, findStore } from "./find-store";
import type { Find } from "./find-store";
import type { Unchanged } from "./lines";
import type { FindTargets } from "./panel-keys";
import { fileId, unfocusedId } from "./selection";
import { useLatest } from "./web";

type Hunks = RpcOutput<typeof diffRpc>["hunks"];

// This plugin typechecks without the DOM library. Declare only what this module uses.
interface PageElement {
  readonly isConnected: boolean;
  scrollTop: number;
  readonly clientHeight: number;
  getBoundingClientRect: () => { readonly top: number; readonly height: number };
  focus: () => void;
  // A text input's, which selects its text.
  select?: () => void;
}

declare const document: {
  querySelector: (selectors: string) => PageElement | null;
  readonly body: PageElement;
  readonly activeElement: PageElement | null;
};

declare const CSS: { escape: (identifier: string) => string };

function elementOf(id: string): PageElement | null {
  return Platform.OS === "web" ? document.querySelector(`#${CSS.escape(id)}`) : null;
}

// A line of the view with the id `view`, on either side of a side-by-side view, by its id.
function lineOf(id: string): PageElement | null {
  return elementOf(id) ?? elementOf(unfocusedId(id));
}

// How far the view with the id `view` scrolls to show the line with the id, below the `margin` at
// its top, as revealDistance has it, if the page has the line.
function distanceTo(view: string, id: string, margin: number): number | undefined {
  const scroller = elementOf(view);
  const line = lineOf(id);

  if (scroller === null || line === null) {
    return undefined;
  }

  const { top, height } = line.getBoundingClientRect();

  return revealDistance(
    top - scroller.getBoundingClientRect().top,
    height,
    scroller.clientHeight,
    margin,
  );
}

// The lines of the view with the id `view` on the page.
function linePage(view: string): LinePage {
  return {
    reveal: (id, margin) => {
      const scroller = elementOf(view);
      const distance = distanceTo(view, id, margin);

      if (scroller === null || distance === undefined) {
        return false;
      }

      scroller.scrollTop += distance;

      return true;
    },
    inView: (id, margin) => distanceTo(view, id, margin) === 0,
    offsetOf: (id) => {
      const scroller = elementOf(view);
      const line = lineOf(id);

      return scroller === null || line === null
        ? undefined
        : line.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    },
  };
}

// Moves focus to the text input with the id, and selects its text.
export function focusAndSelect(id: string): void {
  const input = elementOf(id);

  input?.focus();
  input?.select?.();
}

// The element with focus, which the returned function moves focus back to, while it's still on the
// page, or else to the element with the id `fallback`.
function focusReturner(fallback: string): () => void {
  const focused = Platform.OS === "web" ? document.activeElement : null;

  return () => {
    const back =
      focused !== null && focused !== document.body && focused.isConnected
        ? focused
        : elementOf(fallback);

    back?.focus();
  };
}

// What the find bar finds in of the lines a diff shows, and shows them with.
interface FindableLines {
  // The id of the view the diff shows in, and its index among the view's files.
  view: string;
  fileIndex: number;
  hunks: Hunks;
  // The lines outside its hunks it shows.
  unchanged: Unchanged;
  // Renders the lines of the entire file around the line with the number in the new version.
  showAround: (line: number) => void;
  // How far below the view's top the bars stuck there reach.
  margin: () => number;
}

// Has the find bar find in the lines the diff at the container shows, and show one of them in the
// view, once the entire file renders the lines around it if it hasn't yet.
export function useFindableLines(container: string, lines: FindableLines): void {
  const find = useContext(FindContext);
  const latest = useLatest(lines);
  const pending = useRef<string | null>(null);
  const { view, fileIndex, hunks, unchanged } = lines;
  const sections = useMemo(() => sectionsOf(hunks, unchanged), [hunks, unchanged]);

  useLayoutEffect(
    () =>
      find.add(
        container,
        findableLines({
          container,
          view,
          index: fileIndex,
          sections,
          now: () => ({ unchanged: latest.current.unchanged, margin: latest.current.margin() }),
          showAround: (line, id) => {
            pending.current = id;
            latest.current.showAround(line);
          },
          page: linePage(view),
        }),
      ),
    [find, container, view, fileIndex, sections, latest],
  );

  useLayoutEffect(() => {
    const id = pending.current;

    if (id !== null) {
      pending.current = null;
      linePage(view).reveal(id, latest.current.margin());
    }
  });
}

// Has the find bar count the diff in the view at the index among its files among the collapsed ones
// it doesn't find in, while it's `collapsed`.
export function useCollapsedFile(view: string, fileIndex: number, collapsed: boolean): void {
  const find = useContext(FindContext);

  useLayoutEffect(() => {
    if (!collapsed) {
      return () => {};
    }

    return find.add(fileId(view, fileIndex), collapsedFile(view, fileIndex));
  }, [find, view, fileIndex, collapsed]);
}

// The panel's find bar, whether it's open, the id of its input, what closes it, and what keys
// anywhere in the panel act on.
export interface PanelFind {
  find: Find;
  open: boolean;
  input: string;
  onClose: () => void;
  keys: FindTargets;
}

// The panel with the id `panel`'s find bar. Opened again while it's open, focus moves back to its
// input, and what's typed there is selected. Once it closes, focus goes back where it was before it
// opened, or else to the panel.
export function usePanelFind(panel: string): PanelFind {
  const find = useMemo(() => findStore(), []);
  const open = useSyncExternalStore(find.subscribe, () => find.state().open);
  const input = useId();
  const returnFocus = useRef<(() => void) | null>(null);

  return {
    find,
    open,
    input,
    onClose: () => {
      find.close();
      returnFocus.current?.();
    },
    keys: {
      open: () => {
        if (find.state().open) {
          focusAndSelect(input);
        } else {
          returnFocus.current = focusReturner(panel);
          find.open();
        }
      },
      isOpen: () => find.state().open,
      step: find.step,
    },
  };
}
