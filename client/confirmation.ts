// How long a pressed button waits for its second press.
const waiting = 3000;

export interface Confirmation {
  // Runs an action that needs no confirmation at once. One that does runs on its button's second
  // press, if it comes before the wait is over and no other button is pressed in between. The first
  // press arms the button.
  press: (button: string, confirms: boolean, run: () => void) => void;
  // Ends the wait, for good.
  dispose: () => void;
}

// Asks for a second press before running an action that loses work, without moving the mouse: the
// pressed button, then armed, asks for confirmation. `onArmed` hears which button is armed, if any.
export function confirmation(onArmed: (button: string | undefined) => void): Confirmation {
  let armed: string | undefined;
  // Each press, and disposing, ends the wait before it: a wait disarms only while its press is the
  // latest.
  let latest = {};

  function disarm(): void {
    armed = undefined;
    onArmed(armed);
  }

  return {
    press: (button, confirms, run) => {
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
        run();
      }
    },
    dispose: () => {
      latest = {};
    },
  };
}
