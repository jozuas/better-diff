import type { KeyboardFocus } from "./focus";
import type { Open } from "./groups";
import type { CommandIn } from "./keymap";
import { openStop } from "./sidebar-stops";

// The panel's find bar, as keys anywhere in the panel act on it.
export interface FindTargets {
  // Opens it, or moves focus back to it while it's open.
  open: () => void;
  isOpen: () => boolean;
  // Moves to the next match, 1, or the one before, -1.
  step: (by: 1 | -1) => void;
}

// What keys anywhere in the panel act on.
interface PanelTargets {
  focus: Pick<KeyboardFocus, "toFilter">;
  find: FindTargets;
}

// Moves to the next match, or the one before, while the find bar is open, and says whether it did.
function stepWhileOpen(find: FindTargets, by: 1 | -1): boolean {
  if (!find.isOpen()) {
    return false;
  }

  find.step(by);

  return true;
}

// What each command does with focus anywhere in the panel, and whether it did something: `/` moves
// focus to the filter, ⌘F opens the find bar, and ⌘G and ⇧⌘G move from match to match while it's
// open.
const panelCommands: Record<CommandIn<"panel">, (targets: PanelTargets) => boolean> = {
  filter: ({ focus }) => {
    focus.toFilter();

    return true;
  },
  find: ({ find }) => {
    find.open();

    return true;
  },
  findNext: ({ find }) => stepWhileOpen(find, 1),
  findPrevious: ({ find }) => stepWhileOpen(find, -1),
};

// Does what the command does with focus anywhere in the panel, and says whether it did something.
export function panelCommand(command: CommandIn<"panel">, targets: PanelTargets): boolean {
  return panelCommands[command](targets);
}

// An arrow with focus nowhere in the panel that keys act on: moves focus to what's open, the open
// file's row or the open group's heading, or with nothing open, to the filter, and says it did
// something, so that no arrow pressed in the panel does nothing.
export function openCommand(
  open: Open | undefined,
  focus: Pick<KeyboardFocus, "toStop" | "toFilter">,
): boolean {
  const stop = openStop(open);

  if (stop === undefined) {
    focus.toFilter();
  } else {
    focus.toStop(stop);
  }

  return true;
}
