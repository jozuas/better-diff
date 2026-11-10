import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import type { applyFileRpc, applyLinesRpc, diffRpc } from "../shared/diff";
import type { Target } from "./apply";
import type { ControlsStore } from "./controls";
import { isOpen, isShown } from "./groups";
import type { GroupName, Open, OpenFile } from "./groups";

type Operation = RpcInput<typeof applyFileRpc>["operation"];

type Line = RpcOutput<typeof diffRpc>["hunks"][number]["lines"][number];

type Selection = RpcInput<typeof applyLinesRpc>["lines"];

export interface Action {
  operation: Operation;
  label: string;
  // What its button asks once pressed, for an action that loses work and so runs only on a second
  // press.
  confirmation?: string;
}

// An action the sidebar, or the bar over selected lines, offers, whose button there shows the icon
// until it's armed.
export interface IconAction extends Action {
  // A Lucide icon's name.
  icon: string;
}

const discardFile: IconAction = {
  operation: "discard",
  label: "Discard",
  confirmation: "Confirm discard?",
  icon: "Undo2",
};

const deleteFile: IconAction = {
  operation: "discard",
  label: "Delete",
  confirmation: "Confirm delete?",
  icon: "Trash2",
};

const stageFile: IconAction = { operation: "stage", label: "Stage", icon: "Plus" };

const discardLines: IconAction = {
  operation: "discard",
  label: "Discard Lines",
  confirmation: "Confirm discard?",
  icon: discardFile.icon,
};

const discardHunk: Action = {
  operation: "discard",
  label: "Discard Hunk",
  confirmation: "Confirm discard?",
};

const discardMode: Action = {
  operation: "discard",
  label: "Discard Mode Change",
  confirmation: "Confirm discard?",
};

// Discarding staged changes is left out: they can only be unstaged.
export const fileActions: Record<GroupName, IconAction[]> = {
  modified: [discardFile, stageFile],
  untracked: [deleteFile, stageFile],
  staged: [{ operation: "unstage", label: "Unstage", icon: "Minus" }],
};

// On a group's heading, acting on all its files.
export const groupActions: Record<GroupName, IconAction[]> = {
  modified: [
    { ...discardFile, label: "Discard All" },
    { ...stageFile, label: "Stage All" },
  ],
  untracked: [
    { ...deleteFile, label: "Delete All" },
    { ...stageFile, label: "Stage All" },
  ],
  staged: [{ operation: "unstage", label: "Unstage All", icon: "Minus" }],
};

// On the rows of the files selected in a group, acting on all of them.
const selectionActions: Record<GroupName, IconAction[]> = {
  modified: [
    { ...discardFile, label: "Discard Selected" },
    { ...stageFile, label: "Stage Selected" },
  ],
  untracked: [
    { ...deleteFile, label: "Delete Selected" },
    { ...stageFile, label: "Stage Selected" },
  ],
  staged: [{ operation: "unstage", label: "Unstage Selected", icon: "Minus" }],
};

// A file's row's actions, and what they act on: all the files selected, if it's one of them, or
// else the file, as shown if its diff is.
export interface RowActions {
  actions: IconAction[];
  target: Target;
  // Tells the row's buttons apart from other rows', and from its own while other files are
  // selected, so one armed then is no longer.
  row: string;
  // The file they act on, which their names say, unless they act on the files selected.
  path?: string;
}

export function rowActions(open: Open | undefined, file: OpenFile): RowActions {
  const { group, path } = file;

  if (open !== undefined && "paths" in open && isOpen(open, group, path)) {
    return {
      actions: selectionActions[group],
      target: { group, paths: open.paths, selected: true },
      row: `selected:${group}:${JSON.stringify(open.paths)}:${path}`,
    };
  }

  return {
    actions: fileActions[group],
    target: { file, shown: isShown(open, group, path) },
    row: `file:${group}:${path}`,
    path,
  };
}

export const hunkActions: Record<GroupName, Action[]> = {
  modified: [discardHunk, { operation: "stage", label: "Stage Hunk" }],
  untracked: [discardHunk, { operation: "stage", label: "Stage Hunk" }],
  staged: [{ operation: "unstage", label: "Unstage Hunk" }],
};

// On the bar of a file's mode change, which an untracked file never has.
export const modeActions: Record<GroupName, Action[]> = {
  modified: [discardMode, { operation: "stage", label: "Stage Mode Change" }],
  untracked: [discardMode, { operation: "stage", label: "Stage Mode Change" }],
  staged: [{ operation: "unstage", label: "Unstage Mode Change" }],
};

// What tells a file's bar's buttons apart from other bars', in its diff of the version.
export function fileBarOf(version: string): string {
  return `${version}:file`;
}

// What tells an action's button in the bar apart from the panel's other buttons, which its
// shortcut presses too.
export function buttonOf(bar: string, { operation }: Pick<Action, "operation">): string {
  return `${bar}:${operation}`;
}

// What the panel's buttons share, the one armed and whether an action is running, and pressing one,
// which calls `onRun` just before the action runs, if it does. A press while one is running does
// nothing: the buttons are disabled then, but shortcuts still press them.
export interface Controls extends Pick<ControlsStore, "state" | "subscribe"> {
  press: (button: string, action: Action, target: Target, onRun?: () => void) => void;
  // Takes back the question an armed button asks, if one does, and says whether one did.
  cancel: () => boolean;
}

const stageLines: IconAction = { ...stageFile, label: "Stage Lines" };

// Over the selected lines.
export const lineActions: Record<GroupName, IconAction[]> = {
  modified: [discardLines, stageLines],
  untracked: [discardLines, stageLines],
  staged: [{ operation: "unstage", label: "Unstage Lines", icon: "Minus" }],
};

export function buttonText({ label, confirmation }: Action, armed: boolean): string {
  return (armed ? confirmation : undefined) ?? label;
}

// How an action's button looks: armed, asking for confirmation; warning, in the danger colour, while
// the pointer is over one that loses work; hovered, while it's over another; or plain.
export type ButtonLook = "armed" | "warning" | "hovered" | "plain";

export function buttonLook(action: Action, armed: boolean, hovered: boolean): ButtonLook {
  if (armed) {
    return "armed";
  }

  if (!hovered) {
    return "plain";
  }

  return action.confirmation === undefined ? "hovered" : "warning";
}

// How a text button looks: plain, filled with a tint of its label's colour; primary, in the accent
// colour, as the one that does what what it's in is for; or armed, in the danger colour, as one
// that asks to be pressed again.
export type TextLook = "plain" | "primary" | "armed";

// How a text button looks, as it's given, but for a plain one that asks for confirmation: in the
// danger colour while the pointer is over it, as an action's button that loses work is.
export function textButtonLook(
  look: TextLook,
  confirms: boolean,
  hovered: boolean,
): TextLook | "warning" {
  return confirms && hovered && look === "plain" ? "warning" : look;
}

// A sidebar button's name: what it does to the file at the path, if it acts on one, until it's
// armed.
export function sidebarButtonName(action: Action, armed: boolean, path?: string): string {
  return armed || path === undefined ? buttonText(action, armed) : `${action.label} ${path}`;
}

// Each of the hunk's lines, as an action on lines names them.
export function hunkLines(lines: readonly Line[], hunk: number): Selection {
  return lines.map((_, line) => ({ hunk, line }));
}
