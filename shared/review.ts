import { defineRpc, defineSubscription } from "@getpaseo/plugin";
import { z } from "zod";

const side = z.enum(["old", "new"]);

// What tells a line apart from the others of its version, as a comment on it was started: its text,
// and those of up to three lines before it and after it there, as far as the part of the diff it was
// started in had them. The comment's placed on its line by it as the file changes.
const anchor = z.object({
  text: z.string(),
  before: z.array(z.string()),
  after: z.array(z.string()),
});

export type Anchor = z.infer<typeof anchor>;

// A line of a file's uncommitted changes, by its number in the version it's in, as the review the
// agent reads numbers it: HEAD, on the old side, or the worktree, on the new one, and what tells it
// apart there. A line both have is in each. Neither stages nor unstages, so the line stays the same
// as the file's hunks are staged and unstaged, and shows in whichever of the file's diffs has it. A
// line kept from before comments had anchors stays at its number.
const lineOnSide = {
  side,
  line: z.int().positive(),
  anchor: anchor.exactOptional(),
};

// A comment's lines: the line it's on, which it shows under, and for a comment on several lines, as
// GitHub's start line and side, the first of them, which can be on the other side from the last
// inline, as a removed line before an added one is.
const commentTarget = z.object({
  path: z.string(),
  ...lineOnSide,
  start: z.object(lineOnSide).exactOptional(),
});

export type CommentTarget = z.infer<typeof commentTarget>;

const commentId = z.int().positive();

// A review comment that's pending: kept until it's sent to an agent, and edited or deleted until
// then. Its id tells it apart from the others pending.
const reviewComment = commentTarget.extend({ id: commentId, body: z.string() });

export type ReviewComment = z.infer<typeof reviewComment>;

// The review comments pending on a workspace, in the order of their ids, which is the order they
// were made in, and the message they're to be sent with.
export const review = z.object({ comments: z.array(reviewComment), message: z.string() });

export type Review = z.infer<typeof review>;

// The review of a workspace that has none.
export const noReview: Review = { comments: [], message: "" };

// What a comment written as the text says, without whitespace at either end, or undefined if it
// says nothing, which isn't kept.
export function bodyOf(text: string): string | undefined {
  const body = text.trim();

  return body === "" ? undefined : body;
}

// A change of a workspace's review, as one of its views makes it. Each says what it changes, rather
// than what the whole review becomes, so that two views' changes at once both stand.
export const reviewChange = z.discriminatedUnion("kind", [
  // A comment made: pending after those made before it, unless one already has its id.
  z.object({ kind: z.literal("add"), comment: reviewComment }),
  // What a comment edited says, but where the edit says what the comment said as it started, only
  // while it still does: not once another view has edited or deleted it.
  z.object({
    kind: z.literal("edit"),
    id: commentId,
    body: z.string(),
    said: z.string().exactOptional(),
  }),
  z.object({ kind: z.literal("delete"), id: commentId }),
  // Comments sent to an agent, which no longer pend, but for those changed since.
  z.object({ kind: z.literal("sent"), comments: z.array(reviewComment) }),
  // The message as it's typed, or where the change says what it said, only while it still does.
  z.object({
    kind: z.literal("message"),
    text: z.string(),
    said: z.string().exactOptional(),
  }),
  // A review restored, as one sent: its comments pending again, after those
  // pending, but for those that say what one pending already says on the same lines, and its
  // message, while the review's says nothing.
  z.object({ kind: z.literal("restore"), comments: z.array(reviewComment), message: z.string() }),
]);

export type ReviewChange = z.infer<typeof reviewChange>;

function byId(comment: ReviewComment, other: ReviewComment): number {
  return comment.id - other.id;
}

// The comments but the one with the id.
function without(comments: readonly ReviewComment[], id: number): ReviewComment[] {
  return comments.filter((comment) => comment.id !== id);
}

// The comments still pending once those sent are: all but those still as they were sent. One
// edited while it was sent stays, as what it says now wasn't, and so does one made then, though it
// has the id of one deleted then, unless it says the same of the same lines.
function unsent(
  comments: readonly ReviewComment[],
  sent: readonly ReviewComment[],
): ReviewComment[] {
  const asSent = new Set(sent.map((comment) => JSON.stringify(comment)));

  return comments.filter((comment) => !asSent.has(JSON.stringify(comment)));
}

// What tells a comment from those that say something else, or are on other lines, whatever its id.
function said(comment: ReviewComment): string {
  return JSON.stringify({ ...comment, id: 0 });
}

// The comments with those restored after them, but for those whose ids they have, or that say what
// one of them says on the same lines.
function restored(
  comments: readonly ReviewComment[],
  more: readonly ReviewComment[],
): ReviewComment[] {
  const ids = new Set(comments.map(({ id }) => id));
  const says = new Set(comments.map(said));

  return [
    ...comments,
    ...more.filter((comment) => !ids.has(comment.id) && !says.has(said(comment))),
  ].toSorted(byId);
}

function edited(
  comments: readonly ReviewComment[],
  { id, body, said: before }: Extract<ReviewChange, { kind: "edit" }>,
): ReviewComment[] {
  return comments.map((comment) =>
    comment.id === id && (before === undefined || comment.body === before)
      ? { ...comment, body }
      : comment,
  );
}

// The comments with the one made after them, in the order of their ids, unless one has its id.
function added(comments: readonly ReviewComment[], comment: ReviewComment): ReviewComment[] {
  return comments.some(({ id }) => id === comment.id)
    ? [...comments]
    : [...comments, comment].toSorted(byId);
}

// The review once the change is made.
function changed(current: Review, change: ReviewChange): Review {
  const { comments, message } = current;

  if (change.kind === "add") {
    return { comments: added(comments, change.comment), message };
  }

  if (change.kind === "edit") {
    return { comments: edited(comments, change), message };
  }

  if (change.kind === "delete") {
    return { comments: without(comments, change.id), message };
  }

  if (change.kind === "sent") {
    return { comments: unsent(comments, change.comments), message };
  }

  if (change.kind === "message") {
    return change.said === undefined || change.said === message
      ? { comments, message: change.text }
      : current;
  }

  return {
    comments: restored(comments, change.comments),
    message: bodyOf(message) === undefined ? change.message : message,
  };
}

// The review once the changes are made, one after another.
export function changedBy(current: Review, changes: readonly ReviewChange[]): Review {
  let now = current;

  for (const change of changes) {
    now = changed(now, change);
  }

  return now;
}

// Tells a view of the workspace's review as the workspace keeps it now, and again each time it
// changes, until the view leaves, with how many of the view's own writes, where it's given, are
// made in it. A view that only reads the review gives none.
export const reviewWatchRpc = defineSubscription({
  name: "review.watch",
  input: z.object({ workspace: z.string(), writer: z.string().optional() }),
  event: z.object({ taken: z.int().nonnegative(), review }),
});

// Makes the changes of a view's write, its writes numbered from one in turn, unless the workspace
// keeps that write already, as one sent again where the answer was lost, and answers once the
// workspace keeps the review with it.
export const reviewChangeRpc = defineRpc({
  name: "review.change",
  input: z.object({
    workspace: z.string(),
    writer: z.string(),
    write: z.int().positive(),
    changes: z.array(reviewChange),
  }),
  output: z.object({}),
});
