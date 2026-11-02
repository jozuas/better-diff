import * as fc from "fast-check";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { nextInOrder, pass, thing } from "../test/watched";
import type { Answer, Check, Listens, Thing } from "../test/watched";
import { stopWaiting } from "./wait";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  stopWaiting();
  vi.useRealTimers();
});

type Step = { wait: true; current: boolean; timeout: number } | { wait: false };

const steps = fc.array(
  fc.record({
    after: fc.integer({ min: 0, max: 3000 }),
    step: fc.oneof(
      fc.record({
        wait: fc.constant(true as const),
        current: fc.boolean(),
        timeout: fc.integer({ min: 0, max: 10_000 }),
      }),
      fc.record({ wait: fc.constant(false as const) }),
    ),
  }),
  { maxLength: 20 },
);

interface Wait {
  answer: Answer;
  from: string;
  timeout: number;
}

interface Change {
  order: number;
  at: number;
}

// Takes the steps one after another: each waits for a change, or changes the version and tells
// of it. Says when each change was made.
async function take(
  watched: Thing,
  scenario: readonly { after: number; step: Step }[],
  waits: Wait[],
  version = 1,
): Promise<Change[]> {
  const [next, ...rest] = scenario;

  if (next === undefined) {
    return [];
  }

  await pass(next.after);

  const { step } = next;

  if (step.wait) {
    const from = step.current ? String(version) : "0";

    waits.push({ answer: watched.wait(from, step.timeout), from, timeout: step.timeout });

    const changes = await take(watched, rest, waits, version);

    return changes;
  }

  const changed = { order: nextInOrder(), at: watched.now() };

  watched.set(String(version + 1));
  watched.changed();

  const changes = await take(watched, rest, waits, version + 1);

  return [changed, ...changes];
}

// How long each check waited after the one before it ended.
function restsBetween(checks: readonly Check[]): number[] {
  return checks.map(({ started }, index) => started - (checks[index - 1]?.ended ?? -Infinity));
}

// Whether the waiter was answered with what a check that started after it asked found, or with its
// own version once its wait was over, and the first check after it asked had ended.
function answeredRightly({ answer, from, timeout }: Wait, checks: readonly Check[]): boolean {
  const { asked, at = Number.NaN } = answer;
  const after = checks.filter((check) => check.order > answer.order);

  return answer.version === from
    ? at >= asked + timeout && (after[0]?.ended ?? Infinity) <= at
    : after.find(({ ended }) => ended === at)?.version === answer.version;
}

// Whether the waiter, if it was waiting as the version changed, was answered within `within` of
// each change.
function answeredSoonAfter({ answer }: Wait, changes: readonly Change[], within: number): boolean {
  const { at = Number.NaN } = answer;

  return changes.every((changed) => changed.order < answer.order || at <= changed.at + within);
}

test("answers each waiter in time, from a check that started after it asked, or with its own version once its wait is over", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 300 }),
      fc.constantFrom<Listens>("tells", "fails", "throws"),
      fc.integer({ min: 0, max: 3000 }),
      steps,
      async (took, listens, starts, scenario) => {
        const watched = thing(took, listens, starts);
        const waits: Wait[] = [];
        const changes = await take(watched, scenario, waits);

        await pass(200_000);

        expect(Math.min(...restsBetween(watched.checks))).toBeGreaterThanOrEqual(
          Math.min(1000, 10 * took),
        );
        expect(
          waits.filter(
            ({ answer: { asked, at = Number.NaN }, timeout }) =>
              at > Math.max(asked + timeout, asked + 2 * took + 1000),
          ),
        ).toStrictEqual([]);
        expect(waits.filter((wait) => !answeredRightly(wait, watched.checks))).toStrictEqual([]);
        expect(
          waits.filter(
            (wait) => !answeredSoonAfter(wait, changes, 2 * took + Math.max(1000, 10 * took)),
          ),
        ).toStrictEqual([]);
      },
    ),
  );
});

// Changes the version after each gap in turn, and tells of it.
async function changeAfter(watched: Thing, gaps: readonly number[], version = 2): Promise<void> {
  const [gap, ...rest] = gaps;

  if (gap !== undefined) {
    await pass(gap);
    watched.set(String(version));
    watched.changed();
    await changeAfter(watched, rest, version + 1);
  }
}

test("rests a second at least, or ten times as long as a check took, before each check, while changes keep coming and a waiter asks again as soon as it's answered", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 300 }),
      fc.array(fc.integer({ min: 0, max: 3000 }), { maxLength: 20 }),
      async (took, gaps) => {
        const watched = thing(took);
        const stop = watched.keepWaiting("0");

        await changeAfter(watched, gaps);
        await pass(60_000);
        stop();
        stopWaiting();

        expect(Math.min(...restsBetween(watched.checks))).toBeGreaterThanOrEqual(
          Math.max(1000, 10 * took),
        );
      },
    ),
  );
});
