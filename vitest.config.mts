import { defineConfig } from "vitest/config";

import { QuickestFirst, timeTests } from "./test/stryker-order.mts";

export default defineConfig({
  test: {
    include: ["{client,server,shared,test,tools}/**/*.test.{ts,tsx}"],
    expect: { requireAssertions: true },
    // Under Stryker, a mutant's tests run quickest first, until one fails.
    ...(process.env["STRYKER_MUTATOR_WORKER"] === undefined
      ? { sequence: { shuffle: { tests: true } } }
      : {
          sequence: { sequencer: QuickestFirst },
          reporters: [timeTests],
          runner: "test/stryker-runner.ts",
        }),
    setupFiles: ["vitest.setup.ts"],
  },
});
