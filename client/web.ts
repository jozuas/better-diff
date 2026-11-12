// Stryker disable all: this module imports react-native, which Vitest can't load.
import { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";
import { Platform } from "react-native";

import { KeyboardFocusContext } from "./focus";
import { takesText } from "./key-events";
import type { Point, Rect } from "./menu";
import type { KeptPlace, ViewPage } from "./place";
import { focusedId, unfocusedId } from "./selection";

// This plugin typechecks without the DOM library. Declare only what this module uses.
interface PageScrollEvent {
  readonly target: { readonly id?: string } | null;
}

interface PageElement {
  readonly id: string;
  readonly tagName: string;
  readonly isContentEditable: boolean;
  readonly parentElement: PageElement | null;
  contains: (element: PageElement | null) => boolean;
  scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly style: {
    cursor: string;
    outlineOffset: string;
    overflowAnchor: string;
    paddingRight: string;
    position: string;
    top: string;
    userSelect: string;
    width: string;
  };
  getBoundingClientRect: () => {
    readonly top: number;
    readonly bottom: number;
    readonly left: number;
    readonly width: number;
  };
  querySelectorAll: (selectors: string) => Iterable<PageElement>;
  scrollIntoView: (options: { block: "center" }) => void;
}

interface PageStyleElement {
  textContent: string | null;
  remove: () => void;
}

declare const document: {
  querySelector: (selectors: string) => PageElement | null;
  createElement: (tagName: "style") => PageStyleElement;
  readonly head: { append: (element: PageStyleElement) => void };
  readonly body: PageElement;
  readonly activeElement: PageElement | null;
  addEventListener: (
    type: "scroll",
    listener: (event: PageScrollEvent) => void,
    capture: true,
  ) => void;
  removeEventListener: (
    type: "scroll",
    listener: (event: PageScrollEvent) => void,
    capture: true,
  ) => void;
};

declare function queueMicrotask(task: () => void): void;

declare const CSS: { escape: (identifier: string) => string };

declare const navigator: { readonly platform: string };

// Whether the page is on a Mac, whose keys have symbols of their own.
export function onMac(): boolean {
  return Platform.OS === "web" && navigator.platform.startsWith("Mac");
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
export function scrollBy(container: string, distance: number): void {
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

// Whether nothing on the page has focus, as once the element with focus is gone.
export function nothingFocused(): boolean {
  return (
    Platform.OS === "web" &&
    (document.activeElement === null || document.activeElement === document.body)
  );
}

// Whether focus is somewhere the panel with the id leaves it as it opens: in a text field, as in a
// message being written, or already in the panel.
export function keepsFocus(panel: string): boolean {
  const element = Platform.OS === "web" ? document.activeElement : null;

  return (
    element !== null &&
    (takesText(element) ||
      document.querySelector(`#${CSS.escape(panel)}`)?.contains(element) === true)
  );
}

// Once the caller renders, and no action is `busy`, moves focus to the hunk the panel's keyboard
// focus holds the place of, if nothing has focus, as once the hunk an action ran on with focus in
// its bar is gone.
export function useSettledFocus(busy: boolean): void {
  const focus = useContext(KeyboardFocusContext);

  useLayoutEffect(() => {
    focus.settle(busy, nothingFocused());
  });
}

// Scrolls the element with the id `container` up, if it has to, to show the top of the element with
// the id `target` just below the `margin` at its top, which a bar stuck there takes.
export function scrollUpTo(container: string, target: string, margin: number): void {
  const offset = offsetIn(container, target);

  if (offset !== undefined && offset < margin) {
    scrollToOffset(container, target, margin);
  }
}

// Scrolls the element with the id `container`, if it has to, to show all of the element with the id
// `target` below the `margin` at its top, which bars stuck there take.
export function scrollToShow(container: string, target: string, margin: number): void {
  const scroller =
    Platform.OS === "web" ? document.querySelector(`#${CSS.escape(container)}`) : null;

  const element = scroller === null ? null : document.querySelector(`#${CSS.escape(target)}`);

  if (scroller === null || element === null) {
    return;
  }

  const top = scroller.getBoundingClientRect().top;
  const { top: start, bottom: end } = element.getBoundingClientRect();

  if (start - top < margin) {
    scrollBy(container, start - top - margin);
  } else if (end - top > scroller.clientHeight) {
    scrollBy(container, end - top - scroller.clientHeight);
  }
}

// Scrolls the element with the id to its top.
export function scrollToTop(id: string): void {
  const scroller = Platform.OS === "web" ? document.querySelector(`#${CSS.escape(id)}`) : null;

  if (scroller !== null) {
    scroller.scrollTop = 0;
  }
}

// Scrolls the views the element with the id is in to show it in their middle, if it's on the page.
export function scrollIntoView(id: string): void {
  if (Platform.OS === "web") {
    document.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ block: "center" });
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

// Has the element with the id, once it scrolls up to `top` below the top of the view it's in, stay
// there while what it's in scrolls under it, until the end of what it's in reaches it, as a sticky
// header of the view does. React Native's styles have no sticky position. Nothing while `top` is
// undefined.
export function useStuckAt(id: string, top: number | undefined): void {
  useLayoutEffect(() => {
    const element =
      Platform.OS === "web" && top !== undefined
        ? document.querySelector(`#${CSS.escape(id)}`)
        : null;

    if (element !== null) {
      element.style.position = "sticky";
      element.style.top = `${top}px`;
    }
  }, [id, top]);
}

// Has the focus ring of the element with the id inside it, where what's beside it, such as a bar
// stuck over it, doesn't cover it. Paseo's own focus ring is outside, and its rule outranks React
// Native's styles.
export function useInsetFocusRing(id: string): void {
  useLayoutEffect(() => {
    const element = Platform.OS === "web" ? document.querySelector(`#${CSS.escape(id)}`) : null;

    if (element !== null) {
      element.style.outlineOffset = "-2px";
    }
  }, [id]);
}

// Has the text selected in the element with the id highlighted in the colour, rather than in the
// browser's own, which suits no theme in particular. React Native's styles have no ::selection.
// Nothing while the colour is undefined.
export function useSelectionColor(id: string, color: string | undefined): void {
  useLayoutEffect(() => {
    if (Platform.OS !== "web" || color === undefined) {
      return () => {};
    }

    const style = document.createElement("style");

    style.textContent = `#${CSS.escape(id)} ::selection { background-color: ${color}; }`;
    document.head.append(style);

    return () => {
      style.remove();
    };
  }, [id, color]);
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

// The value the latest render gave, for what runs after it, such as a listener added once rather
// than again with each render's value.
export function useLatest<Value>(value: Value): { readonly current: Value } {
  const latest = useRef(value);

  useLayoutEffect(() => {
    latest.current = value;
  });

  return latest;
}

// The element with the id `view`, which scrolls, as what it shows keeps its place: each line on
// either side of a side-by-side view as the side with focus has it.
export function viewPage(view: string): ViewPage {
  function scroller(): PageElement | null {
    return Platform.OS === "web" ? document.querySelector(`#${CSS.escape(view)}`) : null;
  }

  return {
    ids: () => [...(scroller()?.querySelectorAll("[id]") ?? [])].map(({ id }) => focusedId(id)),
    offsetOf: (id) =>
      id === undefined ? undefined : (offsetIn(view, id) ?? offsetIn(view, unfocusedId(id))),
    scrollTop: () => scroller()?.scrollTop ?? 0,
    atEnd: () => {
      const element = scroller();

      return (
        element !== null && element.scrollTop >= element.scrollHeight - element.clientHeight - 1
      );
    },
    scrollBy: (distance) => {
      scrollBy(view, distance);
    },
  };
}

// A view's, which its diffs keep its place with: until a view gives its own, one that keeps none.
export const KeptPlaceContext = createContext<KeptPlace>({
  show: () => () => {},
  showStarts: () => {},
  hold: () => {},
  settle: () => {},
  scrolled: () => {},
});

// Runs the task once what's rendering now has rendered, and before the page shows it.
export function afterRender(task: () => void): void {
  queueMicrotask(task);
}

// Calls the latest listener each time the element with the id scrolls, whenever it's on the page.
export function useScrolled(id: string, listener: () => void): void {
  const latest = useLatest(listener);

  useEffect(() => {
    if (Platform.OS !== "web") {
      return () => {};
    }

    function listen(event: PageScrollEvent): void {
      if (event.target?.id === id) {
        latest.current();
      }
    }

    document.addEventListener("scroll", listen, true);

    return () => {
      document.removeEventListener("scroll", listen, true);
    };
  }, [id, latest]);
}

// Where the element with the id is on the page, or nowhere, at the page's top left corner, while
// it's not on it, or there's no id.
export function rectOf(id?: string): Rect {
  const box =
    Platform.OS === "web" && id !== undefined
      ? document.querySelector(`#${CSS.escape(id)}`)?.getBoundingClientRect()
      : undefined;

  return box === undefined
    ? { x: 0, y: 0, width: 0, height: 0 }
    : { x: box.left, y: box.top, width: box.width, height: box.bottom - box.top };
}

// Where a menu the keyboard opens for the element with the id shows: under its left end.
export function pointUnder(id: string): Point {
  const { x, y, height } = rectOf(id);

  return { x, y: y + height };
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
