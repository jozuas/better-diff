import type { KeyboardFocus } from "./focus";
import type { CommandIn } from "./keymap";

// What each command does with focus anywhere in the panel: `/` moves focus to the filter.
const panelCommands: Record<
  CommandIn<"panel">,
  (focus: Pick<KeyboardFocus, "toFilter">) => void
> = {
  filter: (focus) => {
    focus.toFilter();
  },
};

// Does what the command does with focus anywhere in the panel, and says it did something.
export function panelCommand(
  command: CommandIn<"panel">,
  focus: Pick<KeyboardFocus, "toFilter">,
): boolean {
  panelCommands[command](focus);

  return true;
}
