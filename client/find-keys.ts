import type { Find, FindState } from "./find-store";
import { chordOf } from "./keymap";
import type { CommandIn } from "./keymap";
import { shortcutText } from "./shortcuts";

// What keys in the find bar act on: the find bar, and what closes it.
interface FindBarTargets {
  find: Pick<Find, "state" | "step" | "setMatchCase">;
  onClose: () => void;
}

// What each command does in the find bar: Enter and F3 move to the next match, with Shift to the one
// before, Alt+C switches Match case, and Escape closes it.
const findCommands: Record<CommandIn<"find">, (targets: FindBarTargets) => void> = {
  next: ({ find }) => {
    find.step(1);
  },
  previous: ({ find }) => {
    find.step(-1);
  },
  matchCase: ({ find }) => {
    find.setMatchCase(!find.state().matchCase);
  },
  close: ({ onClose }) => {
    onClose();
  },
};

// Does what the command does in the find bar, and says it did something.
export function findCommand(command: CommandIn<"find">, targets: FindBarTargets): boolean {
  findCommands[command](targets);

  return true;
}

// How the key that gives the command in the find bar is written, on a Mac or elsewhere: the first,
// if more than one does.
export function findKeyText(command: CommandIn<"find">, mac: boolean): string | undefined {
  return shortcutText(chordOf("find", command, mac), mac);
}

// Which match is current, of how many: "3 of 17", or "No results", or nothing while nothing's
// typed.
export function countText({
  text,
  count,
  current,
}: Pick<FindState, "text" | "count" | "current">): string {
  if (text === "") {
    return "";
  }

  return current === undefined ? "No results" : `${current + 1} of ${count}`;
}

// How many collapsed files the find bar leaves out, if any.
export function collapsedText(collapsed: number): string | undefined {
  if (collapsed === 0) {
    return undefined;
  }

  return `${collapsed} collapsed ${collapsed === 1 ? "file" : "files"} not searched`;
}
