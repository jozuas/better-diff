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
  // Tests run git, so mutants tested side by side slow each other down, past a time limit set from
  // a test run that had the machine to itself. Stryker counts a mutant that times out as detected,
  // which would hide one that survives.
  timeoutFactor: 3,
  reporters: ["clear-text", "html"],
  // The list of every test that ran says nothing about the mutants that survived.
  clearTextReporter: { reportTests: false },
  thresholds: { high: 100, low: 100, break: 100 },
} satisfies PartialStrykerOptions;
