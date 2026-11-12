import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import {
  askPrompt,
  failPrompt,
  promptsVariable,
  startedPrompts,
  workPrompt,
} from "./agent/index.server";
import { paseoUi, testAgent } from "./paseo";
import type { Daemon } from "./paseo";

// An agent in the repository's workspace that only notes what it's sent.
interface Agent {
  // The content of each message it's been sent since it started, as the daemon gave it to it.
  sent: () => unknown[];
}

export interface Agents {
  // Starts an agent with the title, once the panel's open, as starting it before would show it
  // rather than the panel.
  start: (title: string) => Promise<Agent>;
  // Starts one, as start does, that's taking a turn until the test ends, as an agent at work is.
  startWorking: (title: string) => Promise<Agent>;
  // Starts one, as start does, that's taking a turn that waits for permission to run a command.
  startAsking: (title: string) => Promise<Agent>;
  // Starts one, as start does, whose first turn has failed.
  startFailing: (title: string) => Promise<Agent>;
}

// A message the page sends an agent.
export const sendRequest = z.object({
  message: z.object({ type: z.literal("send_agent_message_request") }),
});

// What the test agent notes of each message it's sent, a line of JSON each.
const noted = z.object({ type: z.literal("message"), content: z.array(z.unknown()) });

// The content of each message noted in the file, if there is one.
function notedIn(file: string): unknown[] {
  const lines = existsSync(file) ? readFileSync(file, "utf8").split("\n").slice(0, -1) : [];

  return lines.map((each) => noted.parse(JSON.parse(each)).content);
}

// The content of each message noted in the file, if there is one, but the first, which started
// the agent.
function sentSince(file: string): unknown[] {
  return notedIn(file).slice(1);
}

// The content of each message the test agents Better Diff started in the repository have been
// sent, the first of each, which started it, included.
export function startedAgentsSent(repository: string): unknown[] {
  return notedIn(join(repository, ".git", startedPrompts));
}

// The arguments that start a test agent with the title in the workspace, which notes what it's sent
// in the file.
function runArguments(workspace: string, title: string, notes: string): string[] {
  return [
    "paseo",
    "run",
    "--provider",
    testAgent,
    "--workspace",
    workspace,
    "--title",
    title,
    "--env",
    `${promptsVariable}=${notes}`,
    "--json",
  ];
}

// A test agent to start: the workspace it's in, its title, and the file it notes what it's sent in.
interface Started {
  workspace: string;
  title: string;
  notes: string;
}

// Starts a test agent with the title in the workspace on the daemon, which notes what it's sent in
// the file, once its first turn has ended.
async function startAgent(daemon: Daemon, { workspace, title, notes }: Started): Promise<Agent> {
  await paseoUi(daemon, [...runArguments(workspace, title, notes), "Start"]);

  return { sent: () => sentSince(notes) };
}

// What paseo run says of an agent it doesn't wait for: that it's running its first turn.
const running = z.object({ status: z.literal("running") });

// Starts a test agent as startAgent does, whose first turn doesn't end.
async function startWorkingAgent(
  daemon: Daemon,
  { workspace, title, notes }: Started,
): Promise<Agent> {
  const started = await paseoUi(daemon, [
    ...runArguments(workspace, title, notes),
    "--no-wait",
    workPrompt,
  ]);

  running.parse(JSON.parse(started));

  return { sent: () => sentSince(notes) };
}

// What paseo run says of an agent it doesn't wait for: its ID.
const started = z.object({ agentId: z.string() });

// What paseo inspect says of an agent: what it's doing, and what it's asking permission for.
const inspected = z.object({ Status: z.string(), PendingPermissions: z.array(z.unknown()) });

type Inspected = z.infer<typeof inspected>;

// Waits, up to `tries` tenths of a second, until the agent is as `ready` says.
async function untilReady(
  daemon: Daemon,
  agent: string,
  ready: (state: Inspected) => boolean,
  tries: number,
): Promise<void> {
  const state = inspected.parse(
    JSON.parse(await paseoUi(daemon, ["paseo", "inspect", agent, "--json"])),
  );

  if (ready(state)) {
    return;
  }

  if (tries === 0) {
    throw new Error(`Agent ${agent} didn't become ready: ${JSON.stringify(state)}`);
  }

  await new Promise((resolve) => {
    setTimeout(resolve, 100);
  });
  await untilReady(daemon, agent, ready, tries - 1);
}

// Starts a test agent as startAgent does, whose first turn goes on as the prompt asks, once it's as
// `ready` says.
async function startAsked(
  daemon: Daemon,
  { workspace, title, notes }: Started,
  prompt: string,
  ready: (state: Inspected) => boolean,
): Promise<Agent> {
  const output = await paseoUi(daemon, [
    ...runArguments(workspace, title, notes),
    "--no-wait",
    prompt,
  ]);

  await untilReady(daemon, started.parse(JSON.parse(output)).agentId, ready, 50);

  return { sent: () => sentSince(notes) };
}

// Starts a test agent as startAgent does, whose first turn waits for permission to run a command.
async function startAskingAgent(daemon: Daemon, agent: Started): Promise<Agent> {
  const asking = await startAsked(
    daemon,
    agent,
    askPrompt,
    (state) => state.PendingPermissions.length > 0,
  );

  return asking;
}

// Starts a test agent as startAgent does, whose first turn has failed.
async function startFailingAgent(daemon: Daemon, agent: Started): Promise<Agent> {
  const failing = await startAsked(daemon, agent, failPrompt, (state) => state.Status === "error");

  return failing;
}

// What starts test agents in the workspace on the daemon, each noting what it's sent in the file
// its title names.
export function agentsOn(
  daemon: Daemon,
  workspace: string,
  notesOf: (title: string) => string,
): Agents {
  function toStart(title: string): Started {
    return { workspace, title, notes: notesOf(title) };
  }

  return {
    start: async (title) => {
      const agent = await startAgent(daemon, toStart(title));

      return agent;
    },
    startWorking: async (title) => {
      const agent = await startWorkingAgent(daemon, toStart(title));

      return agent;
    },
    startAsking: async (title) => {
      const agent = await startAskingAgent(daemon, toStart(title));

      return agent;
    },
    startFailing: async (title) => {
      const agent = await startFailingAgent(daemon, toStart(title));

      return agent;
    },
  };
}
