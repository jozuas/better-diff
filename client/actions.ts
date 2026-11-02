import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import type { applyFileRpc, applyLinesRpc, diffRpc } from "../shared/diff";
import type { Target } from "./apply";
import type { GroupName } from "./groups";

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

// An action the sidebar offers too, whose button there shows the icon until it's armed.
export interface SidebarAction extends Action {
  // A Lucide icon's name.
  icon: string;
}

const discardFile: SidebarAction = {
  operation: "discard",
  label: "Discard",
  confirmation: "Confirm discard?",
  icon: "Undo2",
};

const deleteFile: SidebarAction = {
  operation: "discard",
  label: "Delete",
  confirmation: "Confirm delete?",
  icon: "Trash2",
};

const stageFile: SidebarAction = { operation: "stage", label: "Stage", icon: "Plus" };

const discardLines: Action = {
  operation: "discard",
  label: "Discard Lines",
  confirmation: "Confirm discard?",
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
export const fileActions: Record<GroupName, SidebarAction[]> = {
  modified: [discardFile, stageFile],
  untracked: [deleteFile, stageFile],
  staged: [{ operation: "unstage", label: "Unstage", icon: "Minus" }],
};

// On a group's heading, acting on all its files.
export const groupActions: Record<GroupName, SidebarAction[]> = {
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

// What the panel's buttons share: the one armed, whether an action is running, and pressing one,
// which calls `onRun` just before the action runs, if it does.
export interface Controls {
  armed: string | undefined;
  busy: boolean;
  press: (button: string, action: Action, target: Target, onRun?: () => void) => void;
}

// Over the hunk whose lines are selected.
export const lineActions: Record<GroupName, Action[]> = {
  modified: [discardLines, { operation: "stage", label: "Stage Lines" }],
  untracked: [discardLines, { operation: "stage", label: "Stage Lines" }],
  staged: [{ operation: "unstage", label: "Unstage Lines" }],
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

// A sidebar button's name: what it does to the file at the path, if it acts on one, until it's
// armed.
export function sidebarButtonName(action: Action, armed: boolean, path?: string): string {
  return armed || path === undefined ? buttonText(action, armed) : `${action.label} ${path}`;
}

// Each of the hunk's lines, as an action on lines names them.
export function hunkLines(lines: readonly Line[], hunk: number): Selection {
  return lines.map((_, line) => ({ hunk, line }));
}
