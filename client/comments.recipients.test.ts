import { expect, test } from "vitest";

import { recipientsOf } from "./comments";

test("comments go to the workspace's agents that aren't archived, nor Paseo's own, by their titles or else their providers, each working while it runs a turn", () => {
  const agent = {
    id: "a",
    provider: "claude",
    title: "Reviewer",
    workspaceId: "w",
    status: "idle",
  } as const;

  expect(
    recipientsOf(
      [
        { agent },
        { agent: { ...agent, id: "b", title: null } },
        { agent: { ...agent, id: "c", workspaceId: "other" } },
        { agent: { id: "d", provider: "codex", title: "Elsewhere", status: "idle" } },
        { agent: { ...agent, id: "e", archivedAt: "2026-11-07T10:00:00Z" } },
        { agent: { ...agent, id: "f", archivedAt: null } },
        { agent: { ...agent, id: "g", internal: true } },
        { agent: { ...agent, id: "h", internal: false } },
        { agent: { ...agent, id: "i", status: "running" } },
        { agent: { ...agent, id: "j", status: "initializing" } },
        { agent: { ...agent, id: "k", status: "error" } },
        { agent: { ...agent, id: "l", status: "closed" } },
      ],
      "w",
    ),
  ).toStrictEqual([
    { id: "a", label: "Reviewer", working: false },
    { id: "b", label: "claude", working: false },
    { id: "f", label: "Reviewer", working: false },
    { id: "h", label: "Reviewer", working: false },
    { id: "i", label: "Reviewer", working: true },
    { id: "j", label: "Reviewer", working: false },
    { id: "k", label: "Reviewer", working: false },
    { id: "l", label: "Reviewer", working: false },
  ]);
});
