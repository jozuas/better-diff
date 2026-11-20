import type { PluginCommandCapabilities } from "@getpaseo/plugin/client";

import { bodyOf } from "../shared/review";
import type { CommentTarget, ReviewChange, ReviewComment } from "../shared/review";
import type { Keys } from "./keymap";
import type { NumberedLine } from "./lines";
import { numbered } from "./numbering";
import type { Numbering } from "./numbering";
import type { Side } from "./side-by-side";

export type { Anchor, CommentTarget, ReviewComment } from "../shared/review";

type Paseo = PluginCommandCapabilities["paseo"];

type Agent = Awaited<ReturnType<Paseo["agents"]["list"]>>["entries"][number]["agent"];

// The file whose diff lines are in, and how the review numbers them.
export interface NumberedFile {
  path: string;
  numbering: Numbering;
}

// The line of the file's diff on each of the sides whose version has it, in their order, as the
// review numbers it.
function onSides(
  { path, numbering }: NumberedFile,
  line: NumberedLine,
  sides: readonly Side[],
): CommentTarget[] {
  return sides.flatMap((side) => {
    const number = numbered(line, side, numbering);

    return number === undefined ? [] : [{ path, side, line: number }];
  });
}

// What a comment on the line of the file's diff is on: side by side, the line on the side it shows
// on, and inline, the line in the worktree, or else in HEAD, as a removed line is, or an unchanged
// one staged and then removed. Undefined where the review's version hasn't the line, as one only
// the index has, staged and then changed, which the agent couldn't find.
export function targetOf(
  file: NumberedFile,
  line: NumberedLine,
  side?: Side,
): CommentTarget | undefined {
  return onSides(file, line, side === undefined ? ["new", "old"] : [side])[0];
}

// What a comment on the lines from the first of the targets to the last is on: the last, from the
// first, or only the last where they're the same line.
export function rangeOf(first: CommentTarget, last: CommentTarget): CommentTarget {
  const { side, line, anchor } = first;

  if (side === last.side && line === last.line) {
    return last;
  }

  return { ...last, start: anchor === undefined ? { side, line } : { side, line, anchor } };
}

const signs: Record<Side, string> = { old: "\u2212", new: "+" };

// The numbers of a comment's lines, as the review numbers them, for a comment on several: from the
// first to the last, and with each one's side where they're on different sides, as GitHub writes
// them. Undefined for a comment on one line.
export function rangeNumbers({ side: last, line, start }: CommentTarget): string | undefined {
  if (start === undefined) {
    return undefined;
  }

  return start.side === last
    ? `${String(start.line)}\u2013${String(line)}`
    : `${signs[start.side]}${String(start.line)} to ${signs[last]}${String(line)}`;
}

// What a comment on several lines says they are, as Linear says it, or nothing for one on one line.
export function rangeLabel(target: CommentTarget): string | undefined {
  const numbers = rangeNumbers(target);

  return numbers === undefined ? undefined : `Lines ${numbers}`;
}

// Tells the comments on a line apart from those on others.
function targetKey({ path, side, line }: CommentTarget): string {
  return JSON.stringify([path, side, line]);
}

// The comments by the key of the line each is on, in the order they were made.
export function threadsOf(
  comments: readonly ReviewComment[],
): ReadonlyMap<string, ReviewComment[]> {
  const threads = new Map<string, ReviewComment[]>();

  for (const comment of comments) {
    const key = targetKey(comment);

    threads.set(key, [...(threads.get(key) ?? []), comment]);
  }

  return threads;
}

// How many ids each step has, of which a comment made takes one at random, so that two comments
// made at once, on two of the host's clients, have the same id, which changes of each tell it by,
// but once in a million.
const idsAStep = 1_048_576;

// The step after the one the last of the comments' ids is in.
function stepAfter(comments: readonly ReviewComment[]): number {
  return Math.floor(Math.max(0, ...comments.map(({ id }) => id)) / idsAStep) + 1;
}

// Gives a number from 0 up to 1, as Math.random does, which picks a comment's id in its step.
type Picker = () => number;

function idIn(step: number, pick: Picker): number {
  return step * idsAStep + Math.floor(pick() * idsAStep);
}

// A comment being written on a line: a new one, or an edit of the one with the id, under the line,
// or in the review's list of the comments pending. An edit has what the comment said as it started.
export interface Editing {
  target: CommentTarget;
  id: number | undefined;
  said?: string;
  where: "line" | "list";
}

// Whether the comment with the id is being edited there: under its line, or in the review's list.
export function editedIn(
  editing: Editing | undefined,
  id: number,
  where: Editing["where"],
): boolean {
  return editing?.id === id && editing.where === where;
}

// What saving what's written changes: a new comment on its line, with an id greater than those of
// the comments, and most likely than that of one made meanwhile on another client, or what the
// comment it edits says, while it still says what it said as the edit started. What's only
// whitespace changes nothing.
export function saved(
  comments: readonly ReviewComment[],
  { target, id, said }: Pick<Editing, "target" | "id" | "said">,
  text: string,
  pick: Picker = Math.random,
): ReviewChange | undefined {
  const body = bodyOf(text);

  if (body === undefined) {
    return undefined;
  }

  if (id !== undefined) {
    return said === undefined ? { kind: "edit", id, body } : { kind: "edit", id, body, said };
  }

  return { kind: "add", comment: { ...target, id: idIn(stepAfter(comments), pick), body } };
}

// What the comments shown under the line, of the file's diff, are on, as the review numbers it:
// side by side, the line on its side, and inline, on either, as an unchanged line is on both, and a
// comment made on its old side side by side shows under it inline too.
export function shownOn(file: NumberedFile, line: NumberedLine, side?: Side): CommentTarget[] {
  return onSides(file, line, side === undefined ? ["old", "new"] : [side]);
}

// What shows under a line commented on: the comments on it, in the order they were made, and the
// comment being written on it, if any.
export interface Thread {
  comments: readonly ReviewComment[];
  editing: Editing | undefined;
}

function byId(comment: ReviewComment, other: ReviewComment): number {
  return comment.id - other.id;
}

// What shows under the line whose comments are on the targets, of the comments by the key of the
// line each is on and the comment being written under a line, if any: undefined where neither is
// on it. A comment's id is greater than those of the comments made before it.
export function threadAt(
  threads: ReadonlyMap<string, readonly ReviewComment[]>,
  editing: Editing | undefined,
  targets: readonly CommentTarget[],
): Thread | undefined {
  const keys = targets.map(targetKey);
  const comments = keys.flatMap((key) => threads.get(key) ?? []).toSorted(byId);

  const written =
    editing?.where === "line" && keys.includes(targetKey(editing.target)) ? editing : undefined;

  return comments.length === 0 && written === undefined
    ? undefined
    : { comments, editing: written };
}

// A key pressed in a text box, and whether an input method is composing text with it.
export interface TypedKey extends Pick<Keys, "key" | "shiftKey"> {
  // Whether an input method, as for Japanese, is composing text, which Enter then picks.
  isComposing: boolean;
  // 229 for a key an input method takes, which some browsers give once it's done composing.
  keyCode: number;
}

// What the key pressed while a comment or the review's message is written does, as in Paseo's
// message box with its default send shortcut, which plugins can't read: Enter, with Cmd or Ctrl or
// without, saves the comment or sends the review, and with Shift starts a new line. Enter that picks
// what an input method composes only picks it.
export function editorKey({ key, shiftKey, isComposing, keyCode }: TypedKey): "save" | undefined {
  return key === "Enter" && !shiftKey && !isComposing && keyCode !== 229 ? "save" : undefined;
}

// What the key released while a comment is written does: Escape cancels it, as in Paseo's own
// diff. Once it's released, rather than pressed, as the review a comment can be edited in closes
// once Escape is released, and the comment, which is gone once it's cancelled, keeps the review
// from hearing it.
export function editorKeyUp({ key }: Pick<Keys, "key">): "cancel" | undefined {
  return key === "Escape" ? "cancel" : undefined;
}

// A review sent, which can be restored: the comments sent, and the message they were sent with.
export interface SentReview {
  comments: readonly ReviewComment[];
  message: string;
}

// What restores the review sent, where the comments are pending: those sent pending again after
// them, each with an id greater than those before it, as a comment made then has, and the message
// it was sent with.
export function restored(
  comments: readonly ReviewComment[],
  { comments: sent, message }: SentReview,
  pick: Picker = Math.random,
): ReviewChange {
  const first = stepAfter(comments);

  return {
    kind: "restore",
    comments: sent.map((comment, at) => ({ ...comment, id: idIn(first + at, pick) })),
    message,
  };
}

// What discards the review: deletes the comments pending, and empties the message.
export function discarded(comments: readonly ReviewComment[]): ReviewChange[] {
  return [
    ...comments.map(({ id }): ReviewChange => ({ kind: "delete", id })),
    { kind: "message", text: "" },
  ];
}

// What an agent comments can be sent to is doing, as far as sending them goes: nothing, a turn,
// which they'd go to the middle of, a turn waiting for permission to go on, or nothing since its
// last turn failed. Or that they can't be sent to it, as its provider's unavailable.
export type AgentState = "idle" | "working" | "permission" | "error" | "unavailable";

// An agent comments can be sent to, what it's called, what it's doing, and when it was last active,
// in milliseconds since 1970.
export interface Recipient {
  id: string;
  label: string;
  state: AgentState;
  active: number;
}

// An agent as listed, with what tells whether comments can be sent to it, what it's called, what
// it's doing, when it was last active, and what a new agent like it starts as.
export interface ListedAgent {
  agent: Pick<
    Agent,
    | "id"
    | "provider"
    | "title"
    | "workspaceId"
    | "archivedAt"
    | "internal"
    | "status"
    | "updatedAt"
    | "pendingPermissions"
    | "providerUnavailable"
    | "model"
    | "currentModeId"
    | "thinkingOptionId"
  >;
}

function stateOf({
  status,
  pendingPermissions,
  providerUnavailable,
}: ListedAgent["agent"]): AgentState {
  if (providerUnavailable === true) {
    return "unavailable";
  }

  if (pendingPermissions.length > 0) {
    return "permission";
  }

  if (status === "running") {
    return "working";
  }

  return status === "error" ? "error" : "idle";
}

// The agents in the workspace that comments can be sent to, of those listed, as listed: those not
// archived, nor Paseo's own, by their titles, or their providers while they have none, with what
// each is doing, and when it was last active.
export function recipientsOf(entries: readonly ListedAgent[], workspace: string): Recipient[] {
  return entries.flatMap(({ agent }) =>
    agent.workspaceId === workspace &&
    (agent.archivedAt ?? null) === null &&
    agent.internal !== true
      ? [
          {
            id: agent.id,
            label: agent.title ?? agent.provider,
            state: stateOf(agent),
            active: Date.parse(agent.updatedAt),
          },
        ]
      : [],
  );
}

// What a new agent comments are sent to starts as: its provider and model, and the mode and thinking
// option it starts in, or the provider's own where they're null.
export interface NewAgent {
  provider: string;
  model: string;
  mode: string | null;
  thinking: string | null;
}

// What a new agent comments are sent to starts as, of the agents listed, last active first: as the
// one last active in the workspace was, or else the one last active on the host, of those not
// archived, nor Paseo's own, whose providers are available. Undefined where there's none.
export function templateOf(
  entries: readonly ListedAgent[],
  workspace: string,
): NewAgent | undefined {
  const candidates = entries.flatMap(({ agent }) =>
    (agent.archivedAt ?? null) !== null ||
    agent.internal === true ||
    agent.providerUnavailable === true ||
    agent.model === null
      ? []
      : [
          {
            inWorkspace: agent.workspaceId === workspace,
            started: {
              provider: agent.provider,
              model: agent.model,
              mode: agent.currentModeId,
              thinking: agent.thinkingOptionId ?? null,
            },
          },
        ],
  );

  return (candidates.find(({ inWorkspace }) => inWorkspace) ?? candidates[0])?.started;
}

// What an agent comments are sent to is asked, as Paseo's own diff asks it.
export const reviewPrompt = "Please address this code review.";
