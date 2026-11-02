export interface Debounced {
  // Has the action wait to run, in place of any action waiting. Undefined leaves none waiting.
  set: (action: (() => void) | undefined) => void;
  // Runs the action waiting, if any, at once.
  flush: () => void;
}

// Runs the last action set once nothing else is set for `pause` milliseconds, as a field saves
// what's typed once typing pauses.
export function debounced(pause: number): Debounced {
  // Each action set, and flushing, ends the pause before it: a pause runs its action only while
  // it's the one waiting.
  let waiting: { action: () => void } | undefined;

  function flush(): void {
    const set = waiting;

    waiting = undefined;
    set?.action();
  }

  return {
    set: (action) => {
      const set = action === undefined ? undefined : { action };

      waiting = set;
      setTimeout(() => {
        if (waiting === set) {
          flush();
        }
      }, pause);
    },
    flush,
  };
}
