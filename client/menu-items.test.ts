import { expect, test, vi } from "vitest";

import type { Controls } from "./actions";
import { lineBarOf } from "./bar-commands";
import { actionItems } from "./menu-items";

const hunk = {
  oldStart: 1,
  newStart: 1,
  lines: [
    { kind: "removed" as const, text: "old", newline: true, runs: [] },
    { kind: "added" as const, text: "new", newline: true, runs: [] },
  ],
};

const selection = { file: 0, hunk: 0, first: 0, last: 1 };

function linesOf(group: "modified" | "staged", onRun = vi.fn<() => void>()) {
  const lines = lineBarOf(
    { group, path: "a.txt" },
    { version: "v", index: 0, hunk },
    selection,
    onRun,
  );

  if (lines === undefined) {
    throw new Error("Lines are selected.");
  }

  return lines;
}

test("a menu offers the actions on the selected lines, named and drawn as their buttons are, choosing each pressing its button", () => {
  const lines = linesOf("modified");
  const press = vi.fn<Controls["press"]>();
  const items = actionItems(lines, undefined, { press });

  expect(
    items.map(({ label, icon, disabled, armed }) => ({ label, icon, disabled, armed })),
  ).toStrictEqual([
    { label: "Discard Lines", icon: "Undo2", disabled: false, armed: false },
    { label: "Stage Lines", icon: "Plus", disabled: false, armed: false },
  ]);

  for (const item of items) {
    item.onPress();
  }

  expect(press.mock.calls).toStrictEqual(
    lines.actions.map((action) => [
      `${lines.bar}:${action.operation}`,
      action,
      lines.target,
      lines.onRun,
    ]),
  );
});

test("a menu's Discard Lines stays open once chosen, to ask for confirmation, and closes once chosen again, as its button asks", () => {
  const lines = linesOf("modified");
  const press = vi.fn<Controls["press"]>();
  const [discard, stage] = actionItems(lines, undefined, { press });
  const [asking] = actionItems(lines, `${lines.bar}:discard`, { press });

  expect(discard?.stays).toBe(true);
  expect(stage?.stays).toBe(false);
  expect(asking).toMatchObject({ label: "Confirm discard?", armed: true, stays: false });
});

test("a menu offers unstaging staged lines, which asks nothing", () => {
  const press = vi.fn<Controls["press"]>();
  const [unstage, ...others] = actionItems(linesOf("staged"), undefined, { press });

  expect(unstage).toMatchObject({ label: "Unstage Lines", icon: "Minus", stays: false });
  expect(others).toStrictEqual([]);
});

test("a menu offers no actions on lines while none are selected", () => {
  const press = vi.fn<Controls["press"]>();

  expect(actionItems(undefined, undefined, { press })).toStrictEqual([]);
});
