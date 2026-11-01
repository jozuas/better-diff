import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import type { applyFileRpc, applyLinesRpc, diffRpc } from "../shared/diff";
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

const discardFile: Action = {
  operation: "discard",
  label: "Discard",
  confirmation: "Confirm discard?",
};

const deleteFile: Action = {
  operation: "discard",
  label: "Delete",
  confirmation: "Confirm delete?",
};

const discardHunk: Action = {
  operation: "discard",
  label: "Discard Hunk",
  confirmation: "Confirm discard?",
};

// Discarding staged changes is left out: they can only be unstaged.
export const fileActions: Record<GroupName, Action[]> = {
  modified: [discardFile, { operation: "stage", label: "Stage" }],
  untracked: [deleteFile, { operation: "stage", label: "Stage" }],
  staged: [{ operation: "unstage", label: "Unstage" }],
};

export const hunkActions: Record<GroupName, Action[]> = {
  modified: [discardHunk, { operation: "stage", label: "Stage Hunk" }],
  untracked: [{ operation: "stage", label: "Stage Hunk" }],
  staged: [{ operation: "unstage", label: "Unstage Hunk" }],
};

// What an action acts on in the diff with the version: all of the file, or the lines.
export interface Target {
  version: string;
  lines?: Selection;
}

// What the buttons over a diff share: the one armed, whether an action is running, and pressing one.
export interface Controls {
  armed: string | undefined;
  busy: boolean;
  press: (button: string, action: Action, target: Target) => void;
}

export function buttonText({ label, confirmation }: Action, armed: boolean): string {
  return (armed ? confirmation : undefined) ?? label;
}

// Each of the hunk's lines, as an action on lines names them.
export function hunkLines(lines: readonly Line[], hunk: number): Selection {
  return lines.map((_, line) => ({ hunk, line }));
}
