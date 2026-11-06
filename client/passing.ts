import { debounced } from "./debounce";
import type { OpenFile, OpenFiles } from "./groups";

// What opens files as keys move focus through the sidebar's rows: at once, or once keys stop moving
// focus past them, as while one is held down, so that only the file focus stops at is read.
export interface Passing {
  // Opens what's given at once, and no longer the file last passed.
  open: (open: OpenFile | OpenFiles) => void;
  // Opens the file once no other is passed for `pause` milliseconds, or once it's flushed, and no
  // longer the file passed before it.
  pass: (file: OpenFile) => void;
  // Opens the file last passed at once, if it's still to open, as once the key is let go.
  flush: () => void;
  // No longer opens the file last passed.
  dispose: () => void;
}

export function passing(onOpen: (open: OpenFile | OpenFiles) => void, pause: number): Passing {
  const waiting = debounced(pause);

  return {
    open: (open) => {
      waiting.set(undefined);
      onOpen(open);
    },
    pass: (file) => {
      waiting.set(() => {
        onOpen(file);
      });
    },
    flush: waiting.flush,
    dispose: () => {
      waiting.set(undefined);
    },
  };
}
