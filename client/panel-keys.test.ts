import { expect, test } from "vitest";

import { panelCommand } from "./panel-keys";

test("`/` anywhere in the panel moves focus to the filter", () => {
  const done: string[] = [];

  const heard = panelCommand("filter", {
    toFilter: () => {
      done.push("filter");
    },
  });

  expect([heard, done]).toStrictEqual([true, ["filter"]]);
});
