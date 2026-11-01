import type { RunnerTestFile } from "vitest";
import { inject, TestRunner } from "vitest";

// Runs each file's tests quickest first, by the durations test/stryker-order.mts provides.
export default class QuickestFirstRunner extends TestRunner {
  onCollected(files: RunnerTestFile[]): void {
    const durations = inject("testDurations");

    for (const file of files) {
      file.tasks.sort((a, b) => (durations[a.id] ?? 0) - (durations[b.id] ?? 0));
    }
  }
}
