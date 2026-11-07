import type { Side } from "./side-by-side";

// What hears the pointer come over an element and leave it.
export interface PointerHandlers {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

// Which of some things the pointer is over, if any, as each hears it come over it and leave, and
// what hears each time that changes.
interface Pointed<Item> {
  pointed: () => Item | undefined;
  // What hears the pointer come over the thing and leave it, the same each time for the same key,
  // so things rendered with them aren't rendered again for them.
  pointer: (item: Item) => PointerHandlers;
  // Calls the listener each time the thing changes, until the returned function is called.
  subscribe: (listener: () => void) => () => void;
}

// Things the pointer can be over, each told apart from the others by its key.
function pointedOf<Item>(keyOf: (item: Item) => string): Pointed<Item> {
  let pointed: Item | undefined;
  const listeners = new Set<() => void>();
  const pointers = new Map<string, PointerHandlers>();

  function point(item?: Item): void {
    if (item !== pointed) {
      pointed = item;

      for (const listener of listeners) {
        listener();
      }
    }
  }

  return {
    pointed: () => pointed,
    pointer: (item) => {
      const key = keyOf(item);
      const known = pointers.get(key);

      if (known !== undefined) {
        return known;
      }

      const handlers = {
        onPointerEnter: () => {
          point(item);
        },
        onPointerLeave: () => {
          point();
        },
      };

      pointers.set(key, handlers);

      return handlers;
    },
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// Which of a diff's hunks the pointer is over, if any, as the hunks' bars and lines hear it come
// over them and leave, and what hears each time that changes. Each bar hears it apart from the
// diff, so the pointer moving from one hunk to another renders only those two bars again.
export interface PointedHunk {
  hunk: () => number | undefined;
  // What hears the pointer come over the hunk at the index, its bar or its lines, and leave them.
  pointer: (hunk: number) => PointerHandlers;
  subscribe: (listener: () => void) => () => void;
}

export function pointedHunk(): PointedHunk {
  const { pointed, pointer, subscribe } = pointedOf<number>(String);

  return { hunk: pointed, pointer, subscribe };
}

// A line of a hunk, by its index among the hunk's lines, and the side it shows on side by side, or
// undefined inline.
export interface LineAt {
  index: number;
  side: Side | undefined;
}

// Which of a hunk's lines the pointer is over, if any, as each line hears it come over it and
// leave, the same object for the same line each time, and what hears each time that changes. Only
// the lines it moves between are rendered again for it.
export interface PointedLine {
  line: () => LineAt | undefined;
  pointer: (line: LineAt) => PointerHandlers;
  subscribe: (listener: () => void) => () => void;
}

export function pointedLine(): PointedLine {
  const { pointed, pointer, subscribe } = pointedOf<LineAt>(
    ({ index, side }) => `${index} ${String(side)}`,
  );

  return { line: pointed, pointer, subscribe };
}
