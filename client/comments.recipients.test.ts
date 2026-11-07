import { expect, test } from "vitest";

import { recipientsOf } from "./comments";

test("comments go to the workspace's agents that aren't archived, nor Paseo's own, by their titles or else their providers", () => {
  const agent = { id: "a", provider: "claude", title: "Reviewer", workspaceId: "w" };

  expect(
    recipientsOf(
      [
        { agent },
        { agent: { ...agent, id: "b", title: null } },
        { agent: { ...agent, id: "c", workspaceId: "other" } },
        { agent: { id: "d", provider: "codex", title: "Elsewhere" } },
        { agent: { ...agent, id: "e", archivedAt: "2026-11-07T10:00:00Z" } },
        { agent: { ...agent, id: "f", archivedAt: null } },
        { agent: { ...agent, id: "g", internal: true } },
        { agent: { ...agent, id: "h", internal: false } },
      ],
      "w",
    ),
  ).toStrictEqual([
    { id: "a", label: "Reviewer" },
    { id: "b", label: "claude" },
    { id: "f", label: "Reviewer" },
    { id: "h", label: "Reviewer" },
  ]);
});
