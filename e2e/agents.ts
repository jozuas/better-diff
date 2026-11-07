import { existsSync, readFileSync } from "node:fs";

import { z } from "zod";

import { promptsVariable } from "./agent/index.server";
import { paseoUi, testAgent } from "./paseo";
import type { Daemon } from "./paseo";

// An agent in the repository's workspace that only notes what it's sent.
export interface Agent {
  // The content of each message it's been sent since it started, as the daemon gave it to it.
  sent: () => unknown[];
}

export interface Agents {
  // Starts an agent with the title, once the panel's open, as starting it before would show it
  // rather than the panel.
  start: (title: string) => Promise<Agent>;
}

// A message the page sends an agent.
export const sendRequest = z.object({
  message: z.object({ type: z.literal("send_agent_message_request") }),
});

// What the test agent notes of each message it's sent, a line of JSON each.
const noted = z.object({ type: z.literal("message"), content: z.array(z.unknown()) });

// The content of each message noted in the file, if there is one, but the first, which started
// the agent.
function sentSince(file: string): unknown[] {
  const lines = existsSync(file) ? readFileSync(file, "utf8").split("\n").slice(0, -1) : [];

  return lines.slice(1).map((each) => noted.parse(JSON.parse(each)).content);
}

// Starts a test agent with the title in the workspace on the daemon, which notes what it's sent in
// the file.
export async function startAgent(
  daemon: Daemon,
  workspace: string,
  title: string,
  notes: string,
): Promise<Agent> {
  await paseoUi(daemon, [
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
    "Start",
  ]);

  return { sent: () => sentSince(notes) };
}
