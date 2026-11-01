import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

import type { Reporter, TestSequencer, TestSpecification, Vitest } from "vitest/node";
import { z } from "zod";

// Stryker stops testing a mutant at the first test that fails, and most mutants are killed by a
// quick example test, so running quick tests first saves the time slow properties take to pass
// beforehand. Each Stryker test runner times the tests it runs, and a test nobody has timed counts
// as taking no time, so it runs first and gets timed.

declare module "vitest" {
  interface ProvidedContext {
    // How long each test took when it last ran, by its id. test/stryker-runner.ts reads it.
    testDurations: Record<string, number>;
  }
}

const Timing = z.object({ module: z.string(), name: z.string(), duration: z.number() });

const timings = new Map<string, z.infer<typeof Timing>>();

// The test runners all run in Stryker's sandbox, and share their timings through this file there. A
// runner that hasn't run any tests yet starts from the timings of Stryker's initial test run, which
// times every test before any mutant is tested.
const timingsFile = ".test-timings.json";

export const timeTests: Reporter = {
  onTestModuleCollected(testModule) {
    for (const test of testModule.children.allTests()) {
      if (!timings.has(test.id)) {
        timings.set(test.id, { module: testModule.moduleId, name: test.fullName, duration: 0 });
      }
    }
  },
  onTestCaseResult(test) {
    const { state } = test.result();
    const duration = test.diagnostic()?.duration;

    if ((state === "passed" || state === "failed") && duration !== undefined) {
      timings.set(test.id, { module: test.module.moduleId, name: test.fullName, duration });
    }
  },
  onTestRunEnd() {
    const partial = `${timingsFile}.${process.pid}`;

    writeFileSync(partial, JSON.stringify([...timings]));
    renameSync(partial, timingsFile);
  },
};

// The quickest of the file's tests that the run's name pattern selects.
function quickest(file: TestSpecification): number {
  const pattern = file.project.config.testNamePattern;

  const durations = [...timings.values()].flatMap(({ module, name, duration }) =>
    module === file.moduleId && (pattern?.test(name) ?? true) ? [duration] : [],
  );

  return durations.length > 0 ? Math.min(...durations) : 0;
}

export class QuickestFirst implements TestSequencer {
  readonly #vitest: Vitest;

  constructor(vitest: Vitest) {
    this.#vitest = vitest;
  }

  // Stryker doesn't shard.
  shard(files: TestSpecification[]): TestSpecification[] {
    return files;
  }

  sort(files: TestSpecification[]): TestSpecification[] {
    if (timings.size === 0 && existsSync(timingsFile)) {
      const shared = z.array(z.tuple([z.string(), Timing]));

      for (const [id, timing] of shared.parse(JSON.parse(readFileSync(timingsFile, "utf8")))) {
        timings.set(id, timing);
      }
    }

    this.#vitest.provide(
      "testDurations",
      Object.fromEntries([...timings].map(([id, { duration }]) => [id, duration])),
    );

    return files
      .map((file) => ({ file, duration: quickest(file) }))
      .toSorted((a, b) => a.duration - b.duration)
      .map(({ file }) => file);
  }
}
