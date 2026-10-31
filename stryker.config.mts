import type { PartialStrykerOptions } from "@stryker-mutator/api/core";

export default {
  testRunner: "vitest",
  // Components and entry points render or register through React Native or Paseo, which Vitest
  // can't load, so logic belongs in .ts modules. stryker.rules.config.mts mutates the local Oxlint
  // rules.
  mutate: ["{client,server,shared}/**/*.ts", "!**/*.test.ts"],
  // Stryker rewrites the tsconfig it finds through TypeScript's JavaScript API, which TypeScript 7
  // doesn't have. Nothing needs rewriting, since every tsconfig stays inside the project.
  tsconfigFile: "no-tsconfig-to-rewrite.json",
  // Tests need none of the tool and environment state in dot-directories, and devenv's holds
  // sockets Stryker can't copy into its sandbox.
  ignorePatterns: ["/.*"],
  // An incremental run keeps a static mutant's "Survived" even after a test that kills it is added,
  // since nothing records which tests cover module-level code.
  incremental: false,
  reporters: ["clear-text", "html"],
  thresholds: { high: 100, low: 100, break: 100 },
} satisfies PartialStrykerOptions;
