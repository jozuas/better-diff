import type { RpcInput } from "@getpaseo/plugin";

import type { applyFileRpc } from "../shared/diff";
import { apply, misalignedMessage, staleMessage, unwritableMessage } from "./apply";
import type { Server, Target, Where } from "./apply";

type Operation = RpcInput<typeof applyFileRpc>["operation"];

// What the panel's buttons share: the one armed, if any, and whether an action is running.
interface ControlsState {
  armed: string | undefined;
  busy: boolean;
}

// The buttons' state as it is now, and what hears it change. Each button hears it apart from the
// others, so arming one, or an action starting or ending, renders only the buttons it changes.
export interface ControlsStore {
  state: () => ControlsState;
  // Changes what the change gives, and calls the listeners if that changes the state.
  update: (change: Partial<ControlsState>) => void;
  // Calls the listener each time the state changes, until the returned function is called.
  subscribe: (listener: () => void) => () => void;
}

export function controlsStore(): ControlsStore {
  let state: ControlsState = { armed: undefined, busy: false };
  const listeners = new Set<() => void>();

  return {
    state: () => state,
    update: (change) => {
      const next = { ...state, ...change };

      if (next.armed !== state.armed || next.busy !== state.busy) {
        state = next;

        for (const listener of listeners) {
          listener();
        }
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// Runs the action with the store busy until it's done, whether it fails or not, and then until
// `shown` calls back: as once what the action changed shows, which the view settles its focus and
// place on as no action is running.
export async function runBusy(
  store: ControlsStore,
  run: () => Promise<void>,
  shown: (callback: () => void) => void,
): Promise<void> {
  store.update({ busy: true });

  try {
    await run();
  } finally {
    await new Promise<void>((resolve) => {
      shown(() => {
        store.update({ busy: false });
        resolve();
      });
    });
  }
}

// What hears why an action was refused, or failed.
interface Telling {
  refused: (message: string) => void;
  failed: (message: string) => void;
}

// Applies the operation to the target, and tells why if it's refused, as stale or as lined up
// otherwise with whitespace changes shown, or fails.
export async function applyAndTell(
  server: Server,
  where: Where,
  operation: Operation,
  target: Target,
  tell: Telling,
): Promise<void> {
  try {
    const status = await apply(server, where, operation, target);

    if (status === "stale") {
      tell.refused(staleMessage(target));
    }

    if (status === "misaligned") {
      tell.refused(misalignedMessage(operation));
    }

    if (status === "unwritable") {
      tell.refused(unwritableMessage());
    }
  } catch (error) {
    tell.failed(error instanceof Error ? error.message : String(error));
  }
}
