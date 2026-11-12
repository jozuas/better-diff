import { expect, test } from "vitest";

import { recipientsOf, templateOf } from "./comments";
import type { ListedAgent } from "./comments";

const updatedAt = "2026-11-12T10:00:00Z";

const active = Date.parse(updatedAt);

const asking: ListedAgent["agent"]["pendingPermissions"][number] = {
  id: "p",
  provider: "claude",
  name: "Bash",
  kind: "tool",
};

test("comments go to the workspace's agents that aren't archived, nor Paseo's own, by their titles or else their providers, with what each is doing and when it was last active", () => {
  const agent: ListedAgent["agent"] = {
    id: "a",
    provider: "claude",
    title: "Reviewer",
    workspaceId: "w",
    status: "idle",
    updatedAt,
    pendingPermissions: [],
    model: "opus",
    currentModeId: null,
  };

  expect(
    recipientsOf(
      [
        { agent },
        { agent: { ...agent, id: "b", title: null } },
        { agent: { ...agent, id: "c", workspaceId: "other" } },
        {
          agent: {
            ...agent,
            id: "d",
            provider: "codex",
            title: "Elsewhere",
            workspaceId: undefined,
          },
        },
        { agent: { ...agent, id: "e", archivedAt: "2026-11-07T10:00:00Z" } },
        { agent: { ...agent, id: "f", archivedAt: null } },
        { agent: { ...agent, id: "g", internal: true } },
        { agent: { ...agent, id: "h", internal: false } },
        { agent: { ...agent, id: "i", status: "running" } },
        { agent: { ...agent, id: "j", status: "initializing" } },
        { agent: { ...agent, id: "k", status: "error" } },
        { agent: { ...agent, id: "l", status: "closed" } },
        { agent: { ...agent, id: "m", status: "running", pendingPermissions: [asking] } },
        { agent: { ...agent, id: "n", status: "running", providerUnavailable: true } },
        { agent: { ...agent, id: "o", providerUnavailable: false } },
        { agent: { ...agent, id: "q", updatedAt: "2026-11-12T09:00:00Z" } },
      ],
      "w",
    ),
  ).toStrictEqual([
    { id: "a", label: "Reviewer", state: "idle", active },
    { id: "b", label: "claude", state: "idle", active },
    { id: "f", label: "Reviewer", state: "idle", active },
    { id: "h", label: "Reviewer", state: "idle", active },
    { id: "i", label: "Reviewer", state: "working", active },
    { id: "j", label: "Reviewer", state: "idle", active },
    { id: "k", label: "Reviewer", state: "error", active },
    { id: "l", label: "Reviewer", state: "idle", active },
    { id: "m", label: "Reviewer", state: "permission", active },
    { id: "n", label: "Reviewer", state: "unavailable", active },
    { id: "o", label: "Reviewer", state: "idle", active },
    { id: "q", label: "Reviewer", state: "idle", active: active - 60 * 60 * 1000 },
  ]);
});

const listed: ListedAgent["agent"] = {
  id: "a",
  provider: "claude",
  title: "Reviewer",
  workspaceId: "w",
  status: "idle",
  updatedAt,
  pendingPermissions: [],
  model: "opus",
  currentModeId: "plan",
  thinkingOptionId: "high",
};

test("a new agent starts as the one last active in the workspace was, by its provider, model, mode and thinking option, of those not archived, nor Paseo's own, whose providers are available", () => {
  const elsewhere = { ...listed, id: "e", provider: "codex", model: "gpt", workspaceId: "other" };

  expect(
    templateOf(
      [
        { agent: elsewhere },
        { agent: { ...listed, id: "i", internal: true, provider: "internal" } },
        { agent: { ...listed, id: "u", providerUnavailable: true, provider: "gone" } },
        { agent: { ...listed, id: "n", model: null, provider: "unknown" } },
        {
          agent: { ...listed, id: "r", archivedAt: "2026-11-07T10:00:00Z", provider: "archived" },
        },
        { agent: { ...listed, archivedAt: null, internal: false } },
        { agent: { ...listed, id: "b", provider: "later" } },
      ],
      "w",
    ),
  ).toStrictEqual({ provider: "claude", model: "opus", mode: "plan", thinking: "high" });
});

test("without an agent in the workspace, a new agent starts as the one last active on the host was, and without one there either, none can be started", () => {
  const elsewhere = { ...listed, workspaceId: "other", currentModeId: null };

  expect(
    templateOf(
      [
        { agent: { ...listed, internal: true } },
        { agent: { ...elsewhere, thinkingOptionId: undefined, providerUnavailable: false } },
        { agent: { ...elsewhere, id: "b", provider: "later" } },
      ],
      "w",
    ),
  ).toStrictEqual({ provider: "claude", model: "opus", mode: null, thinking: null });
  expect(templateOf([{ agent: { ...listed, internal: true } }], "w")).toBeUndefined();
  expect(templateOf([], "w")).toBeUndefined();
});
