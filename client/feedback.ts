import type { RpcOutput } from "@getpaseo/plugin";
import type { PluginCommandCapabilities } from "@getpaseo/plugin/client";

import type { diffRpc } from "../shared/diff";
import { reviewOf, reviewedDiffs } from "./attachment";
import type { ReviewAttachment, Reviewed, Unsent } from "./attachment";
import { bodyOf, recipientsOf, reviewPrompt, templateOf } from "./comments";
import type { AgentState, ListedAgent, NewAgent, Recipient, ReviewComment } from "./comments";
import { fileKey } from "./numbering";
import type { CommentedFile } from "./numbering";

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

// What sending feedback reaches the daemon with: a page of the host's agents, a file's diff, an
// agent the review is sent to, which interrupts nothing it's doing, and a new agent in the workspace
// started as the template says, which is sent it first.
export interface FeedbackServer {
  listAgents: (cursor: string | undefined) => Promise<Page<ListedAgent>>;
  readDiff: (file: CommentedFile) => Promise<Diff>;
  send: (agent: string, prompt: string, attachment: ReviewAttachment) => Promise<void>;
  start: (template: NewAgent, prompt: string, attachment: ReviewAttachment) => Promise<void>;
}

// The agents in the workspace that feedback can be sent to, and what a new agent it's sent to starts
// as, if one can be started, of all the host lists.
export interface Agents {
  recipients: Recipient[];
  template: NewAgent | undefined;
}

export async function agentsIn(server: FeedbackServer, workspace: string): Promise<Agents> {
  const listed = await listedAll(server.listAgents);

  return { recipients: recipientsOf(listed, workspace), template: templateOf(listed, workspace) };
}

// Whether there's an agent to send feedback to, once they're listed: one in the workspace, or a new
// one.
export function canSendTo(agents?: Agents): agents is Agents {
  return agents !== undefined && (agents.recipients.length > 0 || agents.template !== undefined);
}

// Where feedback goes: to an agent in the workspace, or to a new one, started as the template says.
export type Destination = { agent: Recipient } | { template: NewAgent };

// What the menu of agents says of a new agent after "New agent": its provider and model, as Paseo
// writes them.
export function newAgentLabel({ provider, model }: NewAgent): string {
  return `${provider}/${model}`;
}

type Paseo = PluginCommandCapabilities["paseo"];

// What a new agent in a workspace is started as.
type AgentConfig = Parameters<
  ReturnType<Paseo["workspaces"]["ref"]>["agents"]["create"]
>[0]["config"];

// What a new agent feedback's sent to is started with: its provider and model, as Paseo writes them,
// and its mode and thinking option, where they aren't the provider's own.
export function configOf(template: NewAgent): AgentConfig {
  const config: AgentConfig = { provider: newAgentLabel(template) };

  if (template.mode !== null) {
    config.modeId = template.mode;
  }

  if (template.thinking !== null) {
    config.thinkingOptionId = template.thinking;
  }

  return config;
}

// Whether the agent's taking a turn, which feedback would go to the middle of.
function atWork({ state }: Recipient): boolean {
  return state === "working" || state === "permission";
}

// The menu of the agents feedback can be sent to, in sections: those not at work first, then those
// taking a turn, which it would go to the middle of, and last those it can't be sent to, as their
// providers are unavailable, each in the order listed.
export function agentSections(
  recipients: readonly Recipient[],
): [Recipient[], Recipient[], Recipient[]] {
  const available = recipients.filter(({ state }) => state !== "unavailable");

  return [
    available.filter((recipient) => !atWork(recipient)),
    available.filter(atWork),
    recipients.filter(({ state }) => state === "unavailable"),
  ];
}

const minute = 60 * 1000;
const hour = 60 * minute;
const day = 24 * hour;

// How long ago something was, `elapsed` milliseconds ago: under a minute as just now, and else in
// whole minutes, hours or days.
function agoLabel(elapsed: number): string {
  if (elapsed < minute) {
    return "Just now";
  }

  if (elapsed < hour) {
    return `${String(Math.floor(elapsed / minute))}m ago`;
  }

  return elapsed < day
    ? `${String(Math.floor(elapsed / hour))}h ago`
    : `${String(Math.floor(elapsed / day))}d ago`;
}

const stateLabels: Record<Exclude<AgentState, "idle">, string> = {
  working: "Working",
  permission: "Needs permission",
  error: "Error",
  unavailable: "Unavailable",
};

// What the menu of agents says of one after what it's called, at the time `now`, in milliseconds
// since 1970: what it's doing, unless it's doing nothing, and then how long ago it was last active.
export function agentState({ state, active }: Recipient, now: number): string {
  return state === "idle" ? agoLabel(now - active) : stateLabels[state];
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
  gone: ["its line is no longer in its diffs", "their lines are no longer in their diffs"],
  unread: ["its diffs couldn't be read", "their diffs couldn't be read"],
};

const reasons: readonly Unsent[] = ["gone", "unread"];

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

// Sends the comments to the agent, or a new one, asking it what the message says, or what Paseo's own
// diff asks where it says nothing, and says what came of it: who they were sent to, or that nothing
// was, and how many weren't, and why.
export async function feedbackTo(
  server: FeedbackServer,
  directory: string,
  comments: readonly ReviewComment[],
  to: Destination,
  message: string,
): Promise<Told> {
  const prompt = bodyOf(message) ?? reviewPrompt;

  try {
    const { sent, unsent } = await sendReview(
      directory,
      comments,
      server.readDiff,
      async (review) => {
        await ("agent" in to
          ? server.send(to.agent.id, prompt, review)
          : server.start(to.template, prompt, review));
      },
    );

    const label = "agent" in to ? to.agent.label : "a new agent";
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
// they're being listed, that they couldn't be, or that the workspace has none, and none can be
// started, as the host has none to start one like.
export function agentsNotice({
  pending,
  error,
  agents,
}: {
  pending: boolean;
  error: Error | null;
  agents: Agents | undefined;
}): string | undefined {
  if (pending) {
    return "Finding the workspace's agents…";
  }

  if (error !== null) {
    return `Couldn't list the workspace's agents: ${error.message}`;
  }

  return canSendTo(agents) ? undefined : "Start an agent in this workspace to send it feedback.";
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
