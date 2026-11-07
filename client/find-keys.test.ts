import { expect, test } from "vitest";

import { collapsedText, countText, findCommand, findKeyText } from "./find-keys";
import type { Find } from "./find-store";

// What commands in the find bar did, with Match case on or off: each thing they asked for, in order.
function findBar(matchCase: boolean) {
  const done: string[] = [];

  const find: Pick<Find, "state" | "step" | "setMatchCase"> = {
    state: () => ({ open: true, text: "a", matchCase, count: 2, current: 0, collapsed: 0 }),
    step: (by) => {
      done.push(`step ${String(by)}`);
    },
    setMatchCase: (on) => {
      done.push(`match case ${String(on)}`);
    },
  };

  return {
    done,
    targets: {
      find,
      onClose: () => {
        done.push("close");
      },
    },
  };
}

test("pressing Enter or F3 in the find bar move to the next match, with Shift to the one before, and Escape closes it", () => {
  const { done, targets } = findBar(false);

  expect(
    (["next", "previous", "close"] as const).map((command) => findCommand(command, targets)),
  ).toStrictEqual([true, true, true]);
  expect(done).toStrictEqual(["step 1", "step -1", "close"]);
});

test("pressing Alt+C in the find bar switches Match case on, or off", () => {
  const off = findBar(false);
  const on = findBar(true);

  expect([
    findCommand("matchCase", off.targets),
    findCommand("matchCase", on.targets),
  ]).toStrictEqual([true, true]);
  expect([...off.done, ...on.done]).toStrictEqual(["match case true", "match case false"]);
});

test("the find bar's buttons' keys are written as they are on a Mac, and elsewhere", () => {
  expect(
    (["next", "previous", "matchCase", "close"] as const).map((command) => [
      findKeyText(command, true),
      findKeyText(command, false),
    ]),
  ).toStrictEqual([
    ["↩", "Enter"],
    ["⇧↩", "Shift+Enter"],
    ["⌥C", "Alt+C"],
    ["Esc", "Esc"],
  ]);
});

test("the find bar shows which match is current, of how many, or that there are none, or nothing while nothing's typed", () => {
  expect(countText({ text: "a", count: 17, current: 2 })).toBe("3 of 17");
  expect(countText({ text: "a", count: 1, current: 0 })).toBe("1 of 1");
  expect(countText({ text: "a", count: 0, current: undefined })).toBe("No results");
  expect(countText({ text: "", count: 0, current: undefined })).toBe("");
});

test("the find bar says how many collapsed files it doesn't find in, if any", () => {
  expect(collapsedText(0)).toBeUndefined();
  expect(collapsedText(1)).toBe("1 collapsed file not searched");
  expect(collapsedText(2)).toBe("2 collapsed files not searched");
});
