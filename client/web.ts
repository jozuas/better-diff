// Stryker disable all: this module imports react-native, which Vitest can't load.
import { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";
import { Platform } from "react-native";

import type { Controls } from "./actions";
import { KeyboardFocusContext } from "./focus";
import type { Point } from "./menu";
import type { KeptPlace, ViewPage } from "./place";
import { focusedId, unfocusedId } from "./selection";
import { shortcutPress } from "./shortcuts";
import type { Bar, KeyPress, Level } from "./shortcuts";

// This plugin typechecks without the DOM library. Declare only what this module uses.
interface PageMouseEvent {
  readonly clientX: number;
  readonly clientY: number;
  preventDefault: () => void;
}

interface PageKeyboardEvent extends Readonly<KeyPress> {
  preventDefault: () => void;
}

// What an element's listeners hear, by the event they listen for.
interface PageEvents {
  dblclick: PageMouseEvent;
  contextmenu: PageMouseEvent;
  keydown: PageKeyboardEvent;
}

interface PageScrollEvent {
  readonly target: { readonly id?: string } | null;
}

interface PageElement {
  readonly id: string;
  readonly parentElement: PageElement | null;
  scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly style: {
    cursor: string;
    overflowAnchor: string;
    paddingRight: string;
    position: string;
    top: string;
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
  querySelectorAll: (selectors: string) => Iterable<PageElement>;
}

declare const document: {
  querySelector: (selectors: string) => PageElement | null;
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
function offsetIn(container: string, target: string): number | undefined {
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

// Whether nothing on the page has focus, as once the element with focus is gone.
function nothingFocused(): boolean {
  return (
    Platform.OS === "web" &&
    (document.activeElement === null || document.activeElement === document.body)
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

// Calls the latest listener on each event of the type in the element with the id, while the caller
// is mounted: a listener that's new with each render isn't removed and added again.
function useListener<Type extends keyof PageEvents>(
  id: string,
  type: Type,
  listener: (event: PageEvents[Type]) => void,
): void {
  const latest = useLatest(listener);

  useEffect(() => {
    const element = Platform.OS === "web" ? document.querySelector(`#${CSS.escape(id)}`) : null;

    function listen(event: PageEvents[Type]): void {
      latest.current(event);
    }

    element?.addEventListener(type, listen);

    return () => {
      element?.removeEventListener(type, listen);
    };
  }, [id, type, latest]);
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

// Calls the latest listener on each double click on the element with the id.
export function useDoubleClick(id: string, listener: () => void): void {
  useListener(id, "dblclick", listener);
}

// Calls the latest listener with where the pointer is on each right click on the element with the
// id, in place of the page's own menu.
export function useContextMenu(id: string, listener: (point: Point) => void): void {
  useListener(id, "contextmenu", (event) => {
    event.preventDefault();
    listener({ x: event.clientX, y: event.clientY });
  });
}

// Calls the latest listener with what `read` makes of each key pressed in the element with the id,
// where it makes something of it, in place of what the key does on the page, such as scroll it or
// press the button with focus, as Enter does whatever modifiers are held.
export function useKeys<Read>(
  id: string,
  read: (press: KeyPress) => Read | undefined,
  listener: (read: Read) => void,
): void {
  useListener(id, "keydown", (event) => {
    const made = read(event);

    if (made !== undefined) {
      event.preventDefault();
      listener(made);
    }
  });
}

// Presses the button whose action's shortcut is each key pressed in the element with the id, among
// the bars' at each level, as a click on it would.
export function useShortcuts(
  id: string,
  bars: Partial<Record<Level, Bar | undefined>>,
  controls: Controls,
): void {
  useKeys(
    id,
    (press) => shortcutPress(press, bars),
    (pressed) => {
      if (pressed !== "none") {
        controls.press(pressed.button, pressed.action, pressed.target, pressed.onRun);
      }
    },
  );
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
