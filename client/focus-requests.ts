// The workspaces whose Better Diff panel was asked for from Paseo's command center, whose panel
// moves focus into itself once it shows, and what hears each ask.
export interface FocusRequests {
  ask: (workspace: string) => void;
  // Whether the panel of the workspace was asked for since it last took an ask, and takes it.
  take: (workspace: string) => boolean;
  // Takes each ask for the workspace's panel as it comes, and calls the listener with it, until
  // the returned function is called.
  subscribe: (workspace: string, listener: () => void) => () => void;
}

export function focusRequests(): FocusRequests {
  const asked = new Set<string>();
  const listeners = new Set<(workspace: string) => void>();

  return {
    ask: (workspace) => {
      asked.add(workspace);

      for (const listener of listeners) {
        listener(workspace);
      }
    },
    take: (workspace) => asked.delete(workspace),
    subscribe: (workspace, listener) => {
      function hear(each: string): void {
        if (each === workspace && asked.delete(workspace)) {
          listener();
        }
      }

      listeners.add(hear);

      return () => {
        listeners.delete(hear);
      };
    },
  };
}

// Whether a panel moves focus into itself once it first lists the changes: if it was asked to, or
// else unless focus stays where it is, as in a text field or in the panel already.
export function entersOnList(asked: boolean, focusStays: boolean): boolean {
  return asked || !focusStays;
}
