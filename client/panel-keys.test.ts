import { expect, test } from "vitest";

import { panelCommand } from "./panel-keys";
import type { FindTargets } from "./panel-keys";

// What a command anywhere in the panel did, with the find bar open or closed: each thing it asked
// for, in order.
function targets(open: boolean) {
  const done: string[] = [];

  const find: FindTargets = {
    open: () => {
      done.push("open find");
    },
    isOpen: () => open,
    step: (by) => {
      done.push(`step ${String(by)}`);
    },
  };

  return {
    done,
    targets: {
      focus: {
        toFilter: () => {
          done.push("filter");
        },
      },
      find,
    },
  };
}

test("`/` anywhere in the panel moves focus to the filter", () => {
  const { done, targets: panel } = targets(false);

  expect([panelCommand("filter", panel), done]).toStrictEqual([true, ["filter"]]);
});

test("⌘F anywhere in the panel opens the find bar, open or not", () => {
  const closed = targets(false);
  const open = targets(true);

  expect([panelCommand("find", closed.targets), closed.done]).toStrictEqual([true, ["open find"]]);
  expect([panelCommand("find", open.targets), open.done]).toStrictEqual([true, ["open find"]]);
});

test("⌘G and ⇧⌘G anywhere in the panel move to the next match and the one before while the find bar is open", () => {
  const { done, targets: panel } = targets(true);

  expect([panelCommand("findNext", panel), panelCommand("findPrevious", panel)]).toStrictEqual([
    true,
    true,
  ]);
  expect(done).toStrictEqual(["step 1", "step -1"]);
});

test("⌘G and ⇧⌘G do nothing while the find bar is closed, and the page hears them", () => {
  const { done, targets: panel } = targets(false);

  expect([panelCommand("findNext", panel), panelCommand("findPrevious", panel)]).toStrictEqual([
    false,
    false,
  ]);
  expect(done).toStrictEqual([]);
});
