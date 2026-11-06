import { groupActions } from "./actions";
import type { Controls, RowActions } from "./actions";
import { settled } from "./focus";
import type { KeyboardFocus } from "./focus";
import { isOpen, reachedFile, selectedBy } from "./groups";
import type { GroupName, Open, OpenFile, OpenFiles, SidebarGroup } from "./groups";
import type { CommandIn } from "./keymap";
import { runShortcut } from "./shortcuts";
import type { ActionCommand, Bar } from "./shortcuts";
import { firstRow, openRow, openStop, stopBy, stopInPlace } from "./sidebar-stops";
import type { SidebarStop } from "./sidebar-stops";

// What the sidebar lists, and what's open.
export interface SidebarList {
  groups: readonly SidebarGroup[];
  // The sidebar's headings and rows, in order.
  stops: readonly SidebarStop[];
  open: Open | undefined;
  onOpen: (open: OpenFile | OpenFiles) => void;
  // Opens the file once keys stop moving focus past it, as they do while one is held down.
  onPass: (file: OpenFile) => void;
}

type SidebarFocus = Pick<KeyboardFocus, "toRow" | "toStop" | "toFilter" | "toFile" | "toGroup">;

// What keys in the sidebar act with, and whether the key is held down.
export interface Sidebar {
  list: SidebarList;
  focus: SidebarFocus;
  controls: Pick<Controls, "press">;
  repeat: boolean;
}

// What keys in a file's row act with: the file, its actions, and what opens its menu.
export interface RowKeys {
  stop: OpenFile;
  bar: Bar;
  onMenu: () => void;
}

// What keys in a group's heading act with.
export interface HeadingKeys {
  stop: { group: GroupName };
  // Its actions, while it has any.
  bar: Bar | undefined;
  expanded: boolean;
  // Whether the group is open.
  open: boolean;
  onToggle: () => void;
  onOpen: () => void;
}

// Moves focus to the stop, opening its file if it's a row, once keys stop moving focus past it
// while the key is held down, or up past the first heading, to the filter.
function moveTo(stop: SidebarStop | undefined, step: 1 | -1, { list, focus, repeat }: Sidebar) {
  if (stop?.path !== undefined) {
    const file = { group: stop.group, path: stop.path };

    if (repeat) {
      list.onPass(file);
    } else {
      list.onOpen(file);
    }
  }

  if (stop === undefined && step === -1) {
    focus.toFilter();
  }

  focus.toStop(stop);
}

// Moves focus on through the sidebar from the row or heading, a stop at a time, or with
// `headings`, a heading at a time, opening the file of a row it reaches.
function moving(step: 1 | -1, headings: boolean) {
  return ({ stop, ...sidebar }: { stop: SidebarStop } & Sidebar): boolean => {
    moveTo(stopBy(sidebar.list.stops, stop, step, headings), step, sidebar);

    return true;
  };
}

// Runs the action of the row's or heading's the command runs, if it has any.
function acting(command: ActionCommand) {
  return ({ bar, controls }: { bar: Bar | undefined } & Sidebar): boolean =>
    runShortcut(command, { file: bar }, controls);
}

// The files the sidebar lists of the group.
export function listed({ groups }: Pick<SidebarList, "groups">, group: GroupName): string[] {
  return groups.find(({ name }) => name === group)?.paths ?? [];
}

// Selects one more file, 1, or one fewer, -1, from the row's, and moves focus to the file the
// selection reaches.
function selecting(step: 1 | -1) {
  return ({ stop, list, focus }: RowKeys & Sidebar): boolean => {
    const selected = selectedBy(list.open, stop, listed(list, stop.group), step);

    list.onOpen(selected);
    focus.toStop({ group: stop.group, path: reachedFile(selected) });

    return true;
  };
}

// Opens just the file, if it's one of the files selected, and says whether it was.
function single(file: OpenFile, { open, onOpen }: SidebarList): boolean {
  const selected = open !== undefined && "paths" in open && isOpen(open, file.group, file.path);

  if (selected) {
    onOpen(file);
  }

  return selected;
}

// What each command does with focus in a file's row, and whether it does anything.
const rowCommands: Record<CommandIn<"row">, (row: RowKeys & Sidebar) => boolean> = {
  down: moving(1, false),
  up: moving(-1, false),
  groupDown: moving(1, true),
  groupUp: moving(-1, true),
  selectDown: selecting(1),
  selectUp: selecting(-1),
  into: ({ stop, list, focus }) => {
    focus.toFile(stop, () => {
      list.onOpen(stop);
    });

    return true;
  },
  stageFile: acting("stageFile"),
  discardFile: acting("discardFile"),
  menu: ({ onMenu }) => {
    onMenu();

    return true;
  },
  single: ({ stop, list }) => single(stop, list),
};

// Does what the command does with focus in the file's row, and says whether it did anything: ↓ and
// ↑ move focus on through the sidebar, opening the file of each row they reach, and Alt+↓ and Alt+↑
// move it from heading to heading. Shift+↓ and Shift+↑ select one more file or one fewer, → moves
// focus into the file's diff, opening it first if the view doesn't show it, Shift+Enter and
// Shift+Backspace run the row's actions, the menu key opens its menu, and Escape opens just the
// file, if it's one of the files selected.
export function rowKey(command: CommandIn<"row">, row: RowKeys, sidebar: Sidebar): boolean {
  return rowCommands[command]({ ...row, ...sidebar });
}

// → in a group's heading: expands the group, or once it's expanded, opens it, with focus in its
// diff once it shows.
function expand({ stop, expanded, open, onToggle, onOpen, focus }: HeadingKeys & Sidebar): boolean {
  if (!expanded) {
    onToggle();

    return true;
  }

  if (!open) {
    onOpen();
  }

  focus.toGroup(stop.group, open);

  return true;
}

// What each command does with focus in a group's heading, and whether it does anything.
const headingCommands: Record<CommandIn<"heading">, (heading: HeadingKeys & Sidebar) => boolean> = {
  down: moving(1, false),
  up: moving(-1, false),
  groupDown: moving(1, true),
  groupUp: moving(-1, true),
  collapse: ({ expanded, onToggle }) => {
    if (expanded) {
      onToggle();
    }

    return true;
  },
  expand,
  stageFile: acting("stageFile"),
  discardFile: acting("discardFile"),
};

// Does what the command does with focus in the group's heading, and says whether it did anything:
// moves focus on through the sidebar as in a row, ← collapses the group, → expands it, or once it's
// expanded opens it with focus in its diff, and Shift+Enter and Shift+Backspace run its actions.
export function headingKey(
  command: CommandIn<"heading">,
  heading: HeadingKeys,
  sidebar: Sidebar,
): boolean {
  return headingCommands[command]({ ...heading, ...sidebar });
}

// The filter, as keys in it act on it.
interface FilterKeys {
  filter: string;
  onFilter: (filter: string) => void;
}

// What each command does with focus in the filter, and whether it does anything.
const filterCommands: Record<
  CommandIn<"filter">,
  (filter: FilterKeys & Pick<Sidebar, "list" | "focus">) => boolean
> = {
  first: ({ list, focus }) => {
    const first = firstRow(list.stops);

    if (first !== undefined) {
      list.onOpen(first);
      focus.toRow(first);
    }

    return first !== undefined;
  },
  clear: ({ filter, onFilter, list, focus }) => {
    if (filter === "") {
      focus.toStop(openStop(list.open));
    } else {
      onFilter("");
    }

    return true;
  },
};

// Does what the command does with focus in the filter, and says whether it did anything: ↓ and
// Enter move focus to the first file it lists, opening it, and Escape clears it, or once it's empty
// moves focus to what's open.
export function filterKey(
  command: CommandIn<"filter">,
  filter: FilterKeys,
  list: SidebarList,
  focus: SidebarFocus,
): boolean {
  return filterCommands[command]({ ...filter, list, focus });
}

// Once no action is running, moves focus, if nothing has focus, as once the row an action ran from
// is gone, to the row of the file that's open, as the view moves on to it, or else to the row or
// heading in the place held among the sidebar's stops, and lets go of the place. Holds it until
// then.
export function settledStop(
  held: number | undefined,
  { busy, unfocused }: { busy: boolean; unfocused: boolean },
  { stops, open }: Pick<SidebarList, "stops" | "open">,
  focus: Pick<KeyboardFocus, "toStop">,
): number | undefined {
  return settled(
    held,
    { busy, unfocused },
    {
      find: (index) => openRow(stops, open) ?? stopInPlace(stops, index),
      land: (stop) => {
        focus.toStop(stop);
      },
    },
  );
}

// A file's row's actions, as keys run them, calling `onRun` just before one runs.
export function rowBar({ actions, row, target }: RowActions, onRun: () => void): Bar {
  return { actions, bar: row, target, onRun };
}

// A group's heading's actions, while it has any, as keys run them, calling `onRun` just before one
// runs: none while the filter hides some of its files.
export function groupBar(
  group: GroupName,
  files: string[] | undefined,
  onRun: () => void,
): Bar | undefined {
  return files === undefined
    ? undefined
    : {
        actions: groupActions[group],
        bar: `group:${group}`,
        target: { group, paths: files },
        onRun,
      };
}
