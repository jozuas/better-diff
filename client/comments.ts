import type { PluginCommandCapabilities } from "@getpaseo/plugin/client";
import { z } from "zod";

import type { Keys } from "./keymap";
import type { NumberedLine } from "./lines";
import type { Side } from "./side-by-side";

type Paseo = PluginCommandCapabilities["paseo"];

type Agent = Awaited<ReturnType<Paseo["agents"]["list"]>>["entries"][number]["agent"];

// A line of the diff of a file, as opened from its group, which is unstaged or staged, by its
// number in the version it's in: the old one for a removed line, and the new one for an added one.
// An unchanged line is in both, and is the old one's on the old side of a side-by-side diff.
const commentTarget = z.object({
  diff: z.enum(["unstaged", "staged"]),
  path: z.string(),
  side: z.enum(["old", "new"]) satisfies z.ZodType<Side>,
  line: z.int().positive(),
});

export type CommentTarget = z.infer<typeof commentTarget>;

// A review comment that's pending: kept until it's sent to an agent, and edited or deleted until
// then. Its id tells it apart from the others pending.
export const reviewComment = commentTarget.extend({ id: z.int().positive(), body: z.string() });

export type ReviewComment = z.infer<typeof reviewComment>;

// The diff of a file comments are on.
export type CommentedFile = Pick<CommentTarget, "diff" | "path">;

// The line's number in the side's version, if it's in it.
export function numberIn(line: NumberedLine, side: Side): number | undefined {
  return side === "old" ? line.oldNumber : line.newNumber;
}

// What a comment on the line of the file's diff is on: inline, a removed line's old number and any
// other's new one, and side by side, the number the side shows it with. Undefined where the side
// doesn't show it, as the new side doesn't a removed line.
export function targetOf(
  file: CommentedFile,
  line: NumberedLine,
  side?: Side,
): CommentTarget | undefined {
  const version = side ?? (line.kind === "removed" ? "old" : "new");
  const number = numberIn(line, version);

  return number === undefined ? undefined : { ...file, side: version, line: number };
}

// Tells the comments on a line apart from those on others.
function targetKey({ diff, path, side, line }: CommentTarget): string {
  return JSON.stringify([diff, path, side, line]);
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

// What a comment written as the text says, without whitespace at either end, or undefined if it
// says nothing, which isn't kept.
export function bodyOf(text: string): string | undefined {
  const body = text.trim();

  return body === "" ? undefined : body;
}

// The comments with one more on the target, after them, with an id none of them has.
function withComment(
  comments: readonly ReviewComment[],
  { diff, path, side, line }: CommentTarget,
  body: string,
): ReviewComment[] {
  const id = Math.max(0, ...comments.map((comment) => comment.id)) + 1;

  return [...comments, { diff, path, side, line, id, body }];
}

// The comments with the one with the id saying the body instead.
function withBody(comments: readonly ReviewComment[], id: number, body: string): ReviewComment[] {
  return comments.map((comment) => (comment.id === id ? { ...comment, body } : comment));
}

// The comments but the one with the id.
export function without(comments: readonly ReviewComment[], id: number): ReviewComment[] {
  return comments.filter((comment) => comment.id !== id);
}

// A comment being written on a line: a new one, or an edit of the one with the id, under the line,
// or in the review's list of the comments pending.
export interface Editing {
  target: CommentTarget;
  id: number | undefined;
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

// The comments once what's written is saved: as a new comment on its line, or as what the comment
// it edits says. What's only whitespace isn't saved.
export function saved(
  comments: readonly ReviewComment[],
  { target, id }: Pick<Editing, "target" | "id">,
  text: string,
): readonly ReviewComment[] {
  const body = bodyOf(text);

  if (body === undefined) {
    return comments;
  }

  return id === undefined ? withComment(comments, target, body) : withBody(comments, id, body);
}

// What the comments shown under the line, of the file's diff, are on: side by side, the number its
// side shows, and inline, either of its numbers, as an unchanged line has both, and a comment made
// on its old number side by side shows under it inline too.
export function shownOn(file: CommentedFile, line: NumberedLine, side?: Side): CommentTarget[] {
  const versions: Side[] = side === undefined ? ["old", "new"] : [side];

  return versions.flatMap((version) => {
    const number = numberIn(line, version);

    return number === undefined ? [] : [{ ...file, side: version, line: number }];
  });
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

// What the key pressed while a comment is written does, as in Paseo's own diff: Enter with Cmd or
// Ctrl, but not Shift, saves it. Enter otherwise starts a new line.
export function editorKey({
  key,
  shiftKey,
  ctrlKey,
  metaKey,
}: Omit<Keys, "code">): "save" | undefined {
  return key === "Enter" && !shiftKey && (ctrlKey || metaKey) ? "save" : undefined;
}

// What the key released while a comment is written does: Escape cancels it, as in Paseo's own
// diff. Once it's released, rather than pressed, as the review a comment can be edited in closes
// once Escape is released, and the comment, which is gone once it's cancelled, keeps the review
// from hearing it.
export function editorKeyUp({ key }: Pick<Keys, "key">): "cancel" | undefined {
  return key === "Escape" ? "cancel" : undefined;
}

// The comments still pending once those sent are: all but those still as they were sent. One
// edited while it was sent stays, as what it says now wasn't, and so does one made then, whatever
// it says, though it has the id of one deleted then.
export function unsent(
  comments: readonly ReviewComment[],
  sent: readonly ReviewComment[],
): ReviewComment[] {
  return comments.filter((comment) => !sent.includes(comment));
}

// An agent comments can be sent to, and what it's called.
export interface Recipient {
  id: string;
  label: string;
}

// An agent as listed, with what tells whether comments can be sent to it, and what it's called.
export interface ListedAgent {
  agent: Pick<Agent, "id" | "provider" | "title" | "workspaceId" | "archivedAt" | "internal">;
}

// The agents in the workspace that comments can be sent to, of those listed, as listed: those not
// archived, nor Paseo's own, by their titles, or their providers while they have none.
export function recipientsOf(entries: readonly ListedAgent[], workspace: string): Recipient[] {
  return entries.flatMap(({ agent }) =>
    agent.workspaceId === workspace &&
    (agent.archivedAt ?? null) === null &&
    agent.internal !== true
      ? [{ id: agent.id, label: agent.title ?? agent.provider }]
      : [],
  );
}

// What an agent comments are sent to is asked, as Paseo's own diff asks it.
export const reviewPrompt = "Please address this code review.";
