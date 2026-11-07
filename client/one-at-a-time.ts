// What runs tasks one at a time.
export interface OneAtATime {
  run: (task: () => Promise<void>) => Promise<void>;
}

// Runs tasks one at a time: one asked to run while another runs isn't run, rather than waiting its
// turn. Tells the listener each time one starts running, and each time it stops, though it fails.
export function oneAtATime(onRunning: (running: boolean) => void): OneAtATime {
  let running = false;

  return {
    run: async (task) => {
      if (running) {
        return;
      }

      running = true;
      onRunning(true);

      try {
        await task();
      } finally {
        running = false;
        onRunning(false);
      }
    },
  };
}
