// Stryker disable all: this module imports react-native, which Vitest can't load.
import { useEffect, useState } from "react";
import { Platform } from "react-native";

import type { Controls } from "./actions";
import type { KeyboardFocus } from "./focus";
import { entersOnList } from "./focus-requests";
import type { FocusRequests } from "./focus-requests";
import type { Open } from "./groups";
import { handled, heard } from "./key-events";
import type { KeyEvent } from "./key-events";
import type { CommandIn, Place } from "./keymap";
import type { Point } from "./menu";
import { panelCommand } from "./panel-keys";
import type { FindTargets } from "./panel-keys";
import { markedHunk, pressedBar } from "./reveal";
import { openStop } from "./sidebar-stops";
import { selectedNow } from "./text-selection";
import { keepsFocus, onMac, useLatest } from "./web";

// This plugin typechecks without the DOM library. Declare only what this module uses.
interface PageMouseEvent {
  readonly target: unknown;
  readonly clientX: number;
  readonly clientY: number;
  preventDefault: () => void;
  stopPropagation: () => void;
}

export interface PageKeyboardEvent extends KeyEvent {
  readonly isComposing: boolean;
  readonly keyCode: number;
  preventDefault: () => void;
  stopPropagation: () => void;
}

interface PagePointerEvent {
  readonly target: PageTarget | null;
  // Which of the pointer's buttons is pressed: 0 for the main one.
  readonly button: number;
}

// Where the pointer was let go.
interface PageReleaseEvent {
  readonly clientX: number;
  readonly clientY: number;
}

// What a pointer can be pressed on.
interface PageTarget {
  closest?: (selectors: string) => PageTarget | null;
  readonly dataset?: Readonly<Record<string, string | undefined>>;
}

// What an element's listeners hear, by the event they listen for.
interface PageEvents {
  dblclick: PageMouseEvent;
  mousedown: PageMouseEvent;
  contextmenu: PageMouseEvent;
  keydown: PageKeyboardEvent;
  keyup: PageKeyboardEvent;
  pointerdown: PagePointerEvent;
}

interface PageElement {
  contains: (target: PageTarget | null) => boolean;
  addEventListener: <Type extends keyof PageEvents>(
    type: Type,
    listener: (event: PageEvents[Type]) => void,
    capture: boolean,
  ) => void;
  removeEventListener: <Type extends keyof PageEvents>(
    type: Type,
    listener: (event: PageEvents[Type]) => void,
    capture: boolean,
  ) => void;
}

declare const document: {
  querySelector: (selectors: string) => PageElement | null;
  addEventListener: (
    type: "pointerup" | "pointercancel",
    listener: (event: PageReleaseEvent) => void,
    capture: true,
  ) => void;
  removeEventListener: (
    type: "pointerup" | "pointercancel",
    listener: (event: PageReleaseEvent) => void,
    capture: true,
  ) => void;
};

declare const CSS: { escape: (identifier: string) => string };

// Calls the latest listener on each event of the type in the element with the id, while the caller
// is mounted, with whether the event happened on the element itself, rather than inside it: a
// listener that's new with each render isn't removed and added again. With `capture`, it hears the
// event before what's inside the element does.
function useListener<Type extends keyof PageEvents>(
  id: string,
  type: Type,
  listener: (event: PageEvents[Type], own: boolean) => void,
  capture = false,
): void {
  const latest = useLatest(listener);

  useEffect(() => {
    const element = Platform.OS === "web" ? document.querySelector(`#${CSS.escape(id)}`) : null;

    function listen(event: PageEvents[Type]): void {
      latest.current(event, event.target === element);
    }

    element?.addEventListener(type, listen, capture);

    return () => {
      element?.removeEventListener(type, listen, capture);
    };
  }, [id, type, latest, capture]);
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

// Leaves a right click on the element with the id to the page's own menu, as one in a text field
// pastes, rather than to the menu of what it's in.
export function usePageMenu(id: string): void {
  useListener(id, "contextmenu", (event) => {
    event.stopPropagation();
  });
}

// Calls the latest listener with each key pressed in the element with the id, and whether focus was
// on the element itself, rather than on something inside it, such as one of its buttons, while the
// caller is mounted. A key the listener says it handled does nothing else on the page, and nothing
// outside the element hears it. With `capture`, the element hears keys before what's inside it
// does.
export function useKeys(
  id: string,
  listener: (event: PageKeyboardEvent, own: boolean) => boolean,
  capture = false,
): void {
  useListener(
    id,
    "keydown",
    (event, own) => {
      if (listener(event, own)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    capture,
  );
}

// Calls the latest listener with the command each key pressed in the element with the id gives in
// the place, whether focus was on the element itself, and whether the key is held down, as
// useKeys does. A key held down whose command runs only once does nothing.
export function useCommands<In extends Place>(
  id: string,
  place: In,
  listener: (command: CommandIn<In>, own: boolean, repeat: boolean) => boolean,
  capture = false,
): void {
  useKeys(
    id,
    (event, own) =>
      handled(heard(place, event, onMac()), (command) => listener(command, own, event.repeat)),
    capture,
  );
}

// Calls the latest listener with each key let go in the element with the id.
export function useKeyUp(id: string, listener: (event: PageKeyboardEvent) => void): void {
  useListener(id, "keyup", listener);
}

// Keys anywhere in the panel with the id: `/` moves focus to the filter, and Escape takes back the
// question an armed button asks, before anything else in the panel hears it. Pressing the pointer in the panel gives up moving focus to what keys
// opened once it shows.
export function usePanelKeys(
  id: string,
  focus: KeyboardFocus,
  controls: Controls,
  find: FindTargets,
): void {
  useCommands(id, "panel", (command) => panelCommand(command, { focus, find }));
  useCommands(id, "question", () => controls.cancel(), true);
  useListener(
    id,
    "pointerdown",
    () => {
      focus.abandon();
    },
    true,
  );
}

// What a hunk's lines are inside of, marked with the hunk, where the pointer can press them.
const hunkMarked = "[data-hunk]";

// What a line's comments are inside of, among the lines, where a press is the comments', as in a
// comment being written.
export const commentsMark = { comments: "thread" };
const commentsMarked = "[data-comments]";

// Has a press of the pointer's main button in the element with the id, outside the bars and the
// lines' comments there, move focus once it's let go to the bar of the hunk whose lines it selected
// in the diffs of the element with the id `view`, or else of the hunk whose lines it was pressed
// on, so that keys act on what it pressed. A bar it's pressed on, or what's in one, takes focus
// itself, and a right click opens the lines' menu, which has focus then.
export function useFocusOnPress(id: string, view: string, focus: KeyboardFocus): void {
  useListener(
    id,
    "pointerdown",
    ({ target, button }) => {
      const focusable = target?.closest?.("[tabindex]") ?? null;

      if (
        target === null ||
        button !== 0 ||
        (target.closest?.(commentsMarked) ?? null) !== null ||
        (focusable !== null &&
          document.querySelector(`#${CSS.escape(id)}`)?.contains(focusable) === true)
      ) {
        return;
      }

      const pressed = markedHunk(target.closest?.(hunkMarked)?.dataset?.["hunk"]);

      function release(): void {
        document.removeEventListener("pointerup", release, true);
        document.removeEventListener("pointercancel", release, true);

        const bar = pressedBar(selectedNow(view)?.range, pressed);

        if (bar !== undefined) {
          focus.toBarAt(bar);
        }
      }

      document.addEventListener("pointerup", release, true);
      document.addEventListener("pointercancel", release, true);
    },
    true,
  );
}

// Keeps the page's text selection, and focus, as they are when the pointer is pressed on the element
// with the id, rather than as a press elsewhere moves them: its buttons still hear the press.
export function useKeptSelection(id: string): void {
  useListener(id, "mousedown", (event) => {
    event.preventDefault();
  });
}

// Calls `onPress` each time the pointer's main button is pressed in the element with the id,
// outside the lines' comments there and the element with the id `outside`, and `onRelease` with
// where it's let go after that, once the page's text selection has what the press made it, as a
// press in the selection clears it only once it's let go.
export function useSelecting(
  id: string,
  outside: string,
  onPress: () => void,
  onRelease: (point: Point) => void,
): void {
  const released = useLatest(onRelease);

  useListener(id, "pointerdown", ({ target, button }) => {
    if (
      target === null ||
      button !== 0 ||
      (target.closest?.(commentsMarked) ?? null) !== null ||
      (target.closest?.(`#${CSS.escape(outside)}`) ?? null) !== null
    ) {
      return;
    }

    onPress();

    function release({ clientX, clientY }: PageReleaseEvent): void {
      document.removeEventListener("pointerup", release, true);
      document.removeEventListener("pointercancel", release, true);
      setTimeout(() => {
        released.current({ x: clientX, y: clientY });
      }, 0);
    }

    document.addEventListener("pointerup", release, true);
    document.addEventListener("pointercancel", release, true);
  });
}

// Moves focus to what's open once the changes are first listed in the panel with the id, unless
// focus is in a text field then, as in a message being written, or already in the panel, as once
// Better Diff opens, and each time Paseo's command center asks for the workspace's panel, once it
// shows.
export function useFocusOnOpen(
  requests: FocusRequests,
  { workspace, panel }: { workspace: string; panel: string },
  focus: KeyboardFocus,
  open: Open | undefined,
  listed: boolean,
): void {
  const latest = useLatest(open);

  useEffect(() => {
    function enter(): void {
      focus.toStop(openStop(latest.current));
    }

    if (!listed) {
      return () => {};
    }

    if (entersOnList(requests.take(workspace), keepsFocus(panel))) {
      enter();
    }

    return requests.subscribe(workspace, () => {
      setTimeout(enter, 0);
    });
  }, [requests, workspace, panel, focus, latest, listed]);
}

// Whether focus is in a bar, on the bar itself or on one of its buttons, and what the bar hears
// focus come and go with.
interface BarFocus {
  focused: boolean;
  handlers: {
    onFocus: () => void;
    onBlur: () => void;
  };
}

export function useBarFocus(): BarFocus {
  const [focused, setFocused] = useState(false);

  return {
    focused,
    handlers: {
      onFocus: () => {
        setFocused(true);
      },
      onBlur: () => {
        setFocused(false);
      },
    },
  };
}
