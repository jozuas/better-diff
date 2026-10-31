import type { PartialStrykerOptions } from "@stryker-mutator/api/core";

import config from "./stryker.config.mts";

export default {
  ...config,
  // The plugin's index only registers its rules.
  mutate: ["tools/oxlint/local/*.ts", "!**/*.test.ts", "!tools/oxlint/local/index.ts"],
} satisfies PartialStrykerOptions;
