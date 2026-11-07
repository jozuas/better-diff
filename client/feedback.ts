import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";
import { reviewOf, reviewedDiffs } from "./attachment";
import type { ReviewAttachment, Reviewed, Unsent } from "./attachment";
import { bodyOf, recipientsOf, reviewPrompt } from "./comments";
import type { CommentedFile, ListedAgent, Recipient, ReviewComment } from "./comments";
import { fileKey } from "./review-list";

type Diff = RpcOutput<typeof diffRpc>;

// Some of what's listed, and where what's listed after it starts, if anything is.
interface Page<Entry> {
  entries: Entry[];
  pageInfo: { nextCursor: string | null; hasMore: boolean };
}

// How many agents the daemon is asked to list at a time.
const agentsPerPage = 200;

// The page of agents to ask the daemon for: from where the cursor says, or the first.
export function agentsPage(cursor?: string): { limit: number; cursor?: string } {
  return cursor === undefined ? { limit: agentsPerPage } : { limit: agentsPerPage, cursor };
}

// Everything listed, a page at a time, from where the cursor says, or from the start.
async function listedAll<Entry>(
  list: (cursor: string | undefined) => Promise<Page<Entry>>,
  cursor?: string,
): Promise<Entry[]> {
  const { entries, pageInfo } = await list(cursor);

  return pageInfo.hasMore && pageInfo.nextCursor !== null
    ? [...entries, ...(await listedAll(list, pageInfo.nextCursor))]
    : entries;
}

// What sending feedback reaches the daemon with: a page of the host's agents, a file's diff, and an
// agent the review is sent to, which interrupts nothing it's doing.
export interface FeedbackServer {
  listAgents: (cursor: string | undefined) => Promise<Page<ListedAgent>>;
  readDiff: (file: CommentedFile) => Promise<Diff>;
  send: (agent: string, prompt: string, attachment: ReviewAttachment) => Promise<void>;
}

// The agents in the workspace that feedback can be sent to, of all the host lists.
export async function agentsIn(server: FeedbackServer, workspace: string): Promise<Recipient[]> {
  const listed = await listedAll(server.listAgents);

  return recipientsOf(listed, workspace);
}

// The agent feedback goes to, of those it can: the one chosen, while it's one of them, or else the
// first. None while there are none.
export function recipientOf(
  recipients: readonly Recipient[],
  chosen: string | undefined,
): Recipient | undefined {
  return recipients.find(({ id }) => id === chosen) ?? recipients[0];
}

// Sends an agent the comments the review sends, by the diffs of their files as read now, with the
// lines around them, and asks it what the prompt does, unless there are none to send. A diff that
// can't be read has none of them. Gives the comments sent, and why each of the others wasn't.
async function sendReview(
  directory: string,
  comments: readonly ReviewComment[],
  readDiff: (file: CommentedFile) => Promise<Diff>,
  send: (attachment: ReviewAttachment) => Promise<void>,
): Promise<Reviewed> {
  const read = await Promise.allSettled(
    reviewedDiffs(comments).map(async (file) => {
      const diff = await readDiff(file);

      return [fileKey(file), diff] as const;
    }),
  );

  const diffs = new Map(read.flatMap((each) => (each.status === "fulfilled" ? [each.value] : [])));
  const review = reviewOf(directory, comments, (file) => diffs.get(fileKey(file)));

  if (review.attachment !== undefined) {
    await send(review.attachment);
  }

  return review;
}

// Why comments weren't sent, as said of one and of several.
const why: Record<Unsent, readonly [string, string]> = {
  gone: ["its line is no longer in its diff", "their lines are no longer in their diffs"],
  unread: ["its diff couldn't be read", "their diffs couldn't be read"],
  changed: [
    "its line has changed since it was staged",
    "their lines have changed since they were staged",
  ],
};

const reasons: readonly Unsent[] = ["gone", "unread", "changed"];

// What the panel says, after what was sent, of the comments that weren't, by why.
function unsentSaid(unsent: readonly Unsent[]): string[] {
  return reasons.flatMap((reason) => {
    const count = unsent.filter((each) => each === reason).length;
    const [one, several] = why[reason];

    if (count === 0) {
      return [];
    }

    return [
      count === 1 ? `1 comment wasn't, as ${one}.` : `${count} comments weren't, as ${several}.`,
    ];
  });
}

// What the panel says once it's tried to send feedback, and the comments that no longer pend.
export interface Told {
  message: string;
  variant: "success" | "warning" | "error";
  sent: readonly ReviewComment[];
}

// Sends the comments to the agent, asking it what the message says, or what Paseo's own diff asks
// where it says nothing, and says what came of it: who they were sent to, or that nothing was, and
// how many weren't, and why.
export async function feedbackTo(
  server: FeedbackServer,
  directory: string,
  comments: readonly ReviewComment[],
  { id, label }: Recipient,
  message: string,
): Promise<Told> {
  const prompt = bodyOf(message) ?? reviewPrompt;

  try {
    const { sent, unsent } = await sendReview(
      directory,
      comments,
      server.readDiff,
      async (review) => {
        await server.send(id, prompt, review);
      },
    );

    const said = sent.length === 0 ? "Nothing was sent." : `Feedback sent to ${label}.`;

    return {
      message: [said, ...unsentSaid(unsent)].join(" "),
      variant: sent.length === 0 ? "warning" : "success",
      sent,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    return { message: `Couldn't send feedback: ${reason}`, variant: "error", sent: [] };
  }
}

// What the message to send comments with is once they've been sent with the one sent, or haven't:
// empty, once some have been sent with it, unless it's changed since, and else as it is.
export function messageAfter({ sent }: Told, sentWith: string, message: string): string {
  return sent.length > 0 && message === sentWith ? "" : message;
}

// What the review says of the agents feedback can be sent to, while it can't be sent to one: that
// they're being listed, that they couldn't be, or that the workspace has none.
export function agentsNotice({
  pending,
  error,
  recipients,
}: {
  pending: boolean;
  error: Error | null;
  recipients: readonly Recipient[];
}): string | undefined {
  if (pending) {
    return "Finding the workspace's agents…";
  }

  if (error !== null) {
    return `Couldn't list the workspace's agents: ${error.message}`;
  }

  return recipients.length === 0
    ? "Start an agent in this workspace to send it feedback."
    : undefined;
}

// What the button that opens the review says: how many comments are pending.
export function reviewLabel(pending: number): string {
  return `Review (${pending})`;
}

// What the button that sends feedback says, and while it's being sent.
export function sendLabel(sending: boolean): string {
  return sending ? "Sending feedback" : "Send feedback";
}

// What the button that discards the review says, or asks once it's pressed.
export function discardLabel(armed: boolean): string {
  return armed ? "Confirm discard?" : "Discard review";
}
