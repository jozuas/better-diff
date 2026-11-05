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

// How a thing's checks and listening go.
interface Setup {
  took: number;
  listens: Listens;
  starts: number;
}

const setup: fc.Arbitrary<Setup> = fc.record({
  took: fc.integer({ min: 1, max: 300 }),
  listens: fc.constantFrom<Listens>("tells", "fails", "throws"),
  starts: fc.integer({ min: 0, max: 3000 }),
});

// What a step does to a thing: waits for a change from its version now or another, changes the
// version and tells of it, releases the waits from its version now or another, has the checks that
// start from then fail or hang, or not, or has its listening fail.
type Step =
  | { kind: "wait"; current: boolean; timeout: number }
  | { kind: "change" }
  | { kind: "release"; current: boolean }
  | { kind: "fail checks"; fails: boolean }
  | { kind: "hang checks"; hangs: boolean }
  | { kind: "fail listening" };

const step: fc.Arbitrary<Step> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({
      kind: fc.constant("wait" as const),
      current: fc.boolean(),
      timeout: fc.integer({ min: 0, max: 10_000 }),
    }),
  },
  { weight: 4, arbitrary: fc.record({ kind: fc.constant("change" as const) }) },
  {
    weight: 2,
    arbitrary: fc.record({ kind: fc.constant("release" as const), current: fc.boolean() }),
  },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant("fail checks" as const), fails: fc.boolean() }),
  },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant("hang checks" as const), hangs: fc.boolean() }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("fail listening" as const) }) },
);

// Steps on two things, which share nothing, each a while after the one before it.
const scenarios = fc.array(
  fc.record({ after: fc.integer({ min: 0, max: 3000 }), on: fc.constantFrom(0, 1), step }),
  { maxLength: 30 },
);

// How long after the last step waiting stops: up to long after every wait is over.
const stops = fc.integer({ min: 0, max: 200_000 });

interface Wait {
  answer: Answer;
  from: string;
  timeout: number;
}

interface Change {
  order: number;
  at: number;
}

interface Release {
  order: number;
  at: number;
  from: string;
}

// What a scenario did to a thing, and when waiting stopped.
interface Log {
  setup: Setup;
  thing: Thing;
  version: number;
  waits: Wait[];
  changes: Change[];
  releases: Release[];
  // Whether its checks were ever told to hang.
  hung: boolean;
  stopped: number;
}

function logOf(each: Setup): Log {
  return {
    setup: each,
    thing: thing(each.took, each.listens, each.starts),
    version: 1,
    waits: [],
    changes: [],
    releases: [],
    hung: false,
    stopped: Number.NaN,
  };
}

function fromOf(log: Log, current: boolean): string {
  return current ? String(log.version) : "0";
}

function takeStep(log: Log, taken: Step): void {
  const { thing: watched } = log;

  switch (taken.kind) {
    case "wait": {
      const from = fromOf(log, taken.current);

      log.waits.push({ answer: watched.wait(from, taken.timeout), from, timeout: taken.timeout });
      break;
    }

    case "change": {
      log.changes.push({ order: nextInOrder(), at: watched.now() });
      log.version += 1;
      watched.set(String(log.version));
      watched.changed();
      break;
    }

    case "release": {
      const from = fromOf(log, taken.current);

      log.releases.push({ order: nextInOrder(), at: watched.now(), from });
      watched.release(from);
      break;
    }

    case "fail checks": {
      watched.failChecks(taken.fails);
      break;
    }

    case "hang checks": {
      log.hung ||= taken.hangs;
      watched.hangChecks(taken.hangs);
      break;
    }

    case "fail listening": {
      watched.failed();
      break;
    }
  }
}

type Scenario = readonly { after: number; on: 0 | 1; step: Step }[];

async function take(logs: readonly [Log, Log], scenario: Scenario): Promise<void> {
  const [next, ...rest] = scenario;

  if (next !== undefined) {
    await pass(next.after);
    takeStep(logs[next.on], next.step);
    await take(logs, rest);
  }
}

// Takes the steps, and stops waiting a while after the last, and then waits long enough for a
// check that hangs to be stopped, and listening that's starting to start.
async function run(
  setups: readonly [Setup, Setup],
  scenario: Scenario,
  stopAfter: number,
): Promise<Log[]> {
  // What a run before it left, as one that failed can.
  vi.clearAllTimers();

  const logs = [logOf(setups[0]), logOf(setups[1])] as const;

  await take(logs, scenario);
  await pass(stopAfter);

  for (const log of logs) {
    log.stopped = log.thing.now();
  }

  stopWaiting();
  await pass(60_000);

  return [...logs];
}

// How long each check waited after the one before it ended.
function restsBetween(checks: readonly Check[]): number[] {
  return checks.map(({ started }, index) => started - (checks[index - 1]?.ended ?? -Infinity));
}

// How long each check waited after the one before it ended, once one wasn't stopped: how long a
// check that was stopped took says nothing of how long the next takes.
function restsOnceTook(checks: readonly Check[]): number[] {
  const took = checks.findIndex(({ stopped }) => !stopped);

  return took === -1 ? [] : restsBetween(checks).slice(took + 1);
}

// The longest a check of the thing takes: as long as it takes, or a minute, once it hangs.
function longestOf({ setup: { took }, hung }: Log): number {
  return hung ? 60_000 : took;
}

// Whether the waiter was answered with what a check that started after it asked found, or with
// such a check's failure, or with its own version: once its wait was over and the first check after
// it asked had ended, as the waits from its version were released, or as waiting stopped.
function answeredRightly({ answer, from, timeout }: Wait, log: Log): boolean {
  const { asked, at = Number.NaN } = answer;
  const after = log.thing.checks.filter((check) => check.order > answer.order);
  const ending = after.find(({ ended }) => ended === at);

  if (answer.failed) {
    return ending?.failed === true;
  }

  if (answer.version !== from) {
    return ending?.failed === false && ending.version === answer.version;
  }

  return (
    (at >= asked + timeout && (after[0]?.ended ?? Infinity) <= at) ||
    log.releases.some(
      (released) => released.order > answer.order && released.at === at && released.from === from,
    ) ||
    at === log.stopped
  );
}

// Whether the waiter, if it was waiting as the version changed, was answered within `within` of
// each change.
function answeredSoonAfter({ answer }: Wait, changes: readonly Change[], within: number): boolean {
  const { at = Number.NaN } = answer;

  return changes.every((changed) => changed.order < answer.order || at <= changed.at + within);
}

// How many of the thing's listenings started and weren't stopped: each starts, unless it throws as
// it starts.
function stillListening({ thing: watched, setup: { listens } }: Log): number {
  const started = listens === "throws" ? 0 : watched.listened();

  return started - watched.stopped();
}

test("answers each waiter in time, from a check that started after it asked, or with its own version once its wait is over, it's released or waiting stops, though checks fail or hang and listening fails", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.tuple(setup, setup),
      scenarios,
      stops,
      async (setups, scenario, stopAfter) => {
        const logs = await run(setups, scenario, stopAfter);

        expect(
          logs.map(({ thing: watched, setup: { took } }) =>
            restsOnceTook(watched.checks).filter((rest) => rest < Math.min(1000, 10 * took)),
          ),
        ).toStrictEqual([[], []]);
        expect(
          logs.flatMap((log) =>
            log.waits.filter(
              ({ answer: { asked, at = Number.NaN }, timeout }) =>
                !(at <= Math.max(asked + timeout, asked + 2 * longestOf(log) + 1000)),
            ),
          ),
        ).toStrictEqual([]);
        expect(
          logs.flatMap((log) => log.waits.filter((wait) => !answeredRightly(wait, log))),
        ).toStrictEqual([]);
        expect(
          logs.flatMap((log) =>
            log.waits.filter(
              (wait) =>
                !answeredSoonAfter(
                  wait,
                  log.changes,
                  2 * longestOf(log) + Math.max(1000, 10 * log.setup.took),
                ),
            ),
          ),
        ).toStrictEqual([]);
      },
    ),
  );
});

test("stopping waiting at any point answers every wait, makes no more checks, and leaves no timer or listening behind", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.tuple(setup, setup),
      scenarios,
      stops,
      async (setups, scenario, stopAfter) => {
        const logs = await run(setups, scenario, stopAfter);

        expect(
          logs.flatMap(({ waits }) => waits.filter(({ answer }) => answer.at === undefined)),
        ).toStrictEqual([]);
        expect(
          logs.flatMap(({ thing: watched, stopped }) =>
            watched.checks.filter(({ started }) => started > stopped),
          ),
        ).toStrictEqual([]);
        expect(vi.getTimerCount()).toBe(0);
        expect(logs.map(stillListening)).toStrictEqual([0, 0]);
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
