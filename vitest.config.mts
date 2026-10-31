import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{client,server,shared,tools}/**/*.test.{ts,tsx}"],
    expect: { requireAssertions: true },
    sequence: { shuffle: { tests: true } },
    setupFiles: ["vitest.setup.ts"],
  },
});
