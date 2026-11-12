import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { AgentState, NewAgent, Recipient } from "./comments";
import { agentSections, agentState, agentsNotice, agentsPage } from "./feedback";

const reviewer: Recipient = { id: "a", label: "Reviewer", state: "idle", active: 0 };

const states: AgentState[] = ["idle", "working", "permission", "error", "unavailable"];

// Agents feedback can be sent to, each with an ID of its own, doing anything.
const recipients = fc.uniqueArray(
  fc.record({
    id: fc.string({ unit: "binary" }),
    label: fc.string({ unit: "binary" }),
    state: fc.constantFrom(...states),
    active: fc.nat(),
  }),
  { selector: ({ id }) => id },
);

// The section of the menu of agents each state's in.
const sectionOf: Record<AgentState, number> = {
  idle: 0,
  error: 0,
  working: 1,
  permission: 1,
  unavailable: 2,
};

test("the menu of agents has those not at work first, then those at work, and last those it can't send to, each in the order listed", () => {
  fc.assert(
    fc.property(recipients, (listed) => {
      const sections = agentSections(listed);

      expect(sections.flat()).toStrictEqual(
        listed.toSorted((one, other) => sectionOf[one.state] - sectionOf[other.state]),
      );
      expect(
        sections.every((section, at) => section.every(({ state }) => sectionOf[state] === at)),
      ).toBe(true);
    }),
  );
});

test("the menu of agents says what an agent's doing, unless it's doing nothing, and then how long ago it was last active", () => {
  const now = Date.parse("2026-11-12T10:00:00Z");

  expect(agentState({ ...reviewer, state: "working" }, now)).toBe("Working");
  expect(agentState({ ...reviewer, state: "permission" }, now)).toBe("Needs permission");
  expect(agentState({ ...reviewer, state: "error" }, now)).toBe("Error");
  expect(agentState({ ...reviewer, state: "unavailable" }, now)).toBe("Unavailable");
  expect(agentState({ ...reviewer, active: now - 5 * 60 * 1000 }, now)).toBe("5m ago");
});

test("how long ago an agent was last active is said in whole minutes, hours or days, and as just now under a minute", () => {
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  const said: [number, string][] = [
    [-minute, "Just now"],
    [0, "Just now"],
    [minute - 1, "Just now"],
    [minute, "1m ago"],
    [2 * minute - 1, "1m ago"],
    [hour - 1, "59m ago"],
    [hour, "1h ago"],
    [day - 1, "23h ago"],
    [day, "1d ago"],
    [45 * day + hour, "45d ago"],
  ];

  expect(said.map(([elapsed]) => agentState({ ...reviewer, active: -elapsed }, 0))).toStrictEqual(
    said.map(([, label]) => label),
  );
});

const template: NewAgent = { provider: "claude", model: "opus", mode: null, thinking: null };

test("while feedback can't be sent to an agent, nor a new one, the review says why", () => {
  const listed = { recipients: [reviewer], template: undefined };
  const agents = { pending: false, error: null, agents: listed };

  expect(agentsNotice(agents)).toBeUndefined();
  expect(agentsNotice({ ...agents, agents: { recipients: [], template } })).toBeUndefined();
  expect(agentsNotice({ pending: true, error: null, agents: undefined })).toBe(
    "Finding the workspace's agents…",
  );
  expect(
    agentsNotice({ pending: false, error: new Error("Disconnected."), agents: undefined }),
  ).toBe("Couldn't list the workspace's agents: Disconnected.");
  expect(agentsNotice({ ...agents, agents: { recipients: [], template: undefined } })).toBe(
    "Start an agent in this workspace to send it feedback.",
  );
});

test("the daemon is asked for agents a page of 200 at a time, from the cursor, if there's one", () => {
  expect(agentsPage()).toStrictEqual({ limit: 200 });
  expect(agentsPage("next")).toStrictEqual({ limit: 200, cursor: "next" });
});
