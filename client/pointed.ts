// What hears the pointer come over an element and leave it.
interface PointerHandlers {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

// Which of a diff's hunks the pointer is over, if any, as the hunks' bars and lines hear it come
// over them and leave, and what hears each time that changes. Each bar hears it apart from the
// diff, so the pointer moving from one hunk to another renders only those two bars again.
export interface PointedHunk {
  hunk: () => number | undefined;
  // What hears the pointer come over the hunk at the index, its bar or its lines, and leave them,
  // the same each time, so lines rendered with them aren't rendered again for them.
  pointer: (hunk: number) => PointerHandlers;
  // Calls the listener each time the hunk changes, until the returned function is called.
  subscribe: (listener: () => void) => () => void;
}

export function pointedHunk(): PointedHunk {
  let pointed: number | undefined;
  const listeners = new Set<() => void>();
  const pointers = new Map<number, PointerHandlers>();

  function point(hunk?: number): void {
    if (hunk !== pointed) {
      pointed = hunk;

      for (const listener of listeners) {
        listener();
      }
    }
  }

  return {
    hunk: () => pointed,
    pointer: (hunk) => {
      const known = pointers.get(hunk);

      if (known !== undefined) {
        return known;
      }

      const handlers = {
        onPointerEnter: () => {
          point(hunk);
        },
        onPointerLeave: () => {
          point();
        },
      };

      pointers.set(hunk, handlers);

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
