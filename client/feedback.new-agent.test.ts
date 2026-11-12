import type { RpcOutput } from "@getpaseo/plugin";
import { expect, test } from "vitest";

import type { diffRpc } from "../shared/diff";
import { reviewOf } from "./attachment";
import type { ReviewAttachment } from "./attachment";
import type { NewAgent, ReviewComment } from "./comments";
import { canSendTo, configOf, feedbackTo, newAgentLabel } from "./feedback";
import type { FeedbackServer } from "./feedback";

type Diff = RpcOutput<typeof diffRpc>;

const added: Diff = {
  version: "version",
  kind: "text",
  added: 1,
  removed: 0,
  hunks: [
    { oldStart: 0, newStart: 1, lines: [{ kind: "added", text: "", newline: true, runs: [] }] },
  ],
  contents: [],
};

// The diffs of every file: an unstaged one, which adds one line, and a staged one, which changes
// nothing.
function diffOf(side: "unstaged" | "staged"): Diff {
  return side === "unstaged" ? added : { ...added, kind: "unchanged", added: 0, hunks: [] };
}

const comment: ReviewComment = { path: "a.txt", side: "new", line: 1, id: 1, body: "Why?" };

const template: NewAgent = { provider: "claude", model: "opus", mode: "plan", thinking: "high" };

// What the daemon was asked to send an agent, and to start a new one with.
interface Asked {
  sends: unknown[];
  starts: [NewAgent, string, ReviewAttachment][];
}

function server(asked: Asked): FeedbackServer {
  return {
    listAgents: async () => {
      await Promise.resolve();

      return { entries: [], pageInfo: { hasMore: false, nextCursor: null } };
    },
    readDiff: async ({ diff }) => {
      await Promise.resolve();

      return diffOf(diff);
    },
    send: async (...sent) => {
      asked.sends.push(sent);
      await Promise.resolve();
    },
    start: async (...started) => {
      asked.starts.push(started);
      await Promise.resolve();
    },
  };
}

test("feedback sent to a new agent starts one in the workspace as the template says, with the message and the review, and says so", async () => {
  const asked: Asked = { sends: [], starts: [] };
  const told = await feedbackTo(server(asked), "/repository", [comment], { template }, "Fix it.");
  const { attachment } = reviewOf("/repository", [comment], ({ diff }) => diffOf(diff));

  expect(told).toStrictEqual({
    message: "Feedback sent to a new agent.",
    variant: "success",
    sent: [comment],
  });
  expect(asked.starts).toStrictEqual([[template, "Fix it.", attachment]]);
  expect(asked.sends).toStrictEqual([]);
});

test("feedback can be sent once the agents are listed, while there's an agent in the workspace, or a new one can be started", () => {
  const reviewer = { id: "a", label: "Reviewer", state: "idle", active: 0 } as const;

  expect(canSendTo({ recipients: [reviewer], template: undefined })).toBe(true);
  expect(canSendTo({ recipients: [], template })).toBe(true);
  expect(canSendTo({ recipients: [], template: undefined })).toBe(false);
  expect(canSendTo()).toBe(false);
});

test("a new agent is called by its provider and model, as Paseo writes them, and started with its mode and thinking option, where they aren't the provider's own", () => {
  expect(newAgentLabel(template)).toBe("claude/opus");
  expect(configOf(template)).toStrictEqual({
    provider: "claude/opus",
    modeId: "plan",
    thinkingOptionId: "high",
  });
  expect(configOf({ ...template, mode: null, thinking: null })).toStrictEqual({
    provider: "claude/opus",
  });
});
