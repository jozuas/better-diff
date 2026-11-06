// How long a pressed button waits for its second press.
const waiting = 3000;

export interface Confirmation {
  // Runs an action that needs no confirmation at once. One that does runs on its button's second
  // press, if it comes before the wait is over and no other button is pressed in between. The first
  // press arms the button. A press while an action it ran is running does nothing, as a disabled
  // button does: the action is running until `run`'s promise settles.
  press: (button: string, confirms: boolean, run: () => Promise<void>) => void;
  // Takes back the question an armed button asks, if one does, and says whether one did.
  cancel: () => boolean;
  // Ends the wait, for good.
  dispose: () => void;
}

// Asks for a second press before running an action that loses work, without moving the mouse: the
// pressed button, then armed, asks for confirmation. Runs one action at a time. `onArmed` hears
// which button is armed, if any.
export function confirmation(onArmed: (button: string | undefined) => void): Confirmation {
  let armed: string | undefined;
  // Each press, and disposing, ends the wait before it: a wait disarms only while its press is the
  // latest.
  let latest = {};
  let running = false;

  function disarm(): void {
    armed = undefined;
    onArmed(armed);
  }

  async function runAlone(run: () => Promise<void>): Promise<void> {
    running = true;

    try {
      await run();
    } catch {
      // An action that fails is over too, and says why itself.
    } finally {
      running = false;
    }
  }

  return {
    press: (button, confirms, run) => {
      if (running) {
        return;
      }

      const press = {};

      latest = press;

      if (confirms && armed !== button) {
        armed = button;
        onArmed(armed);
        setTimeout(() => {
          if (latest === press) {
            disarm();
          }
        }, waiting);
      } else {
        disarm();
        void runAlone(run);
      }
    },
    cancel: () => {
      if (armed === undefined) {
        return false;
      }

      latest = {};
      disarm();

      return true;
    },
    dispose: () => {
      latest = {};
    },
  };
}
