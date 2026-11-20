import * as fc from "fast-check";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { nextInOrder, pass, thing, toldTo } from "../test/watched";
import type { Check, Listens, Subscription, Thing } from "../test/watched";
import { unsubscribeAll } from "./subscribers";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  unsubscribeAll();
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

// What a step does to a thing: a subscriber comes, one of those there leaves, its version changes,
// which its listener tells of or not, the checks that start from then fail or hang, or not, or its
// listening fails.
type Step =
  | { kind: "subscribe" }
  | { kind: "leave"; which: number }
  | { kind: "change"; told: boolean }
  | { kind: "fail checks"; fails: boolean }
  | { kind: "hang checks"; hangs: boolean }
  | { kind: "fail listening" };

const step: fc.Arbitrary<Step> = fc.oneof(
  { weight: 4, arbitrary: fc.record({ kind: fc.constant("subscribe" as const) }) },
  {
    weight: 2,
    arbitrary: fc.record({ kind: fc.constant("leave" as const), which: fc.nat({ max: 5 }) }),
  },
  {
    weight: 4,
    arbitrary: fc.record({ kind: fc.constant("change" as const), told: fc.boolean() }),
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

// How long after the last step all are unsubscribed: up to long after the last check a step calls
// for.
const stops = fc.integer({ min: 0, max: 200_000 });

// A change of version the listener told of.
interface Change {
  order: number;
  at: number;
}

// What a scenario did to a thing, and when all were unsubscribed.
interface Log {
  setup: Setup;
  thing: Thing;
  version: number;
  subscriptions: Subscription[];
  changes: Change[];
  // Whether its checks were ever told to hang.
  hung: boolean;
  stopped: number;
  stoppedOrder: number;
}

function logOf(each: Setup): Log {
  return {
    setup: each,
    thing: thing(each.took, each.listens, each.starts),
    version: 1,
    subscriptions: [],
    changes: [],
    hung: false,
    stopped: Number.NaN,
    stoppedOrder: Number.NaN,
  };
}

function takeStep(log: Log, taken: Step): void {
  const { thing: watched } = log;

  switch (taken.kind) {
    case "subscribe": {
      log.subscriptions.push(watched.subscribe());
      break;
    }

    case "leave": {
      const there = log.subscriptions.filter(({ left }) => left === undefined);

      there[taken.which % there.length]?.leave();
      break;
    }

    case "change": {
      log.version += 1;
      watched.set(String(log.version));

      if (taken.told) {
        log.changes.push({ order: nextInOrder(), at: watched.now() });
        watched.changed();
      }

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

// Takes the steps, and unsubscribes all a while after the last, and then waits long enough for a
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
    log.stoppedOrder = nextInOrder();
  }

  unsubscribeAll();
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

// What the subscription should be told, and when: what each check that started after it came
// found, as it ended, before the subscription left or all were unsubscribed, unless that's what the
// one before found.
function dueTo({ order, leftOrder = Infinity }: Subscription, log: Log): [string, number][] {
  const found = log.thing.checks.filter(
    (check) =>
      check.order > order &&
      !check.failed &&
      check.endedOrder < Math.min(leftOrder, log.stoppedOrder),
  );

  return found.flatMap(({ version, ended }, index) =>
    found[index - 1]?.version === version ? [] : [[version, ended] satisfies [string, number]],
  );
}

// How long at most before a check starts for a subscriber that comes, or after a change that's
// told of: once a check that runs has ended, which takes as long as checks take, or a minute, once
// they hang, and the rest after it is over.
function soon({ setup: { took }, hung }: Log): number {
  return (hung ? 60_000 : took) + Math.max(1000, 10 * took);
}

// Whether a check started after what came at `order`, and by `by`.
function checkedBy({ thing: watched }: Log, order: number, by: number): boolean {
  return watched.checks.some((check) => check.order > order && check.started <= by);
}

// The subscriptions that came, and the changes told of, with subscribers there, that no check
// started soon after, though none left, and all weren't unsubscribed, until then.
function unchecked(log: Log): (Subscription | Change)[] {
  const within = soon(log);

  function stayed({ order, left = Infinity }: Subscription, since: number, until: number): boolean {
    return order < since && Math.min(left, log.stopped) >= until;
  }

  return [
    ...log.subscriptions.filter(
      (subscription) =>
        stayed(subscription, Infinity, subscription.subscribed + within) &&
        !checkedBy(log, subscription.order, subscription.subscribed + within),
    ),
    ...log.changes.filter(
      ({ order, at }) =>
        log.subscriptions.some((subscription) => stayed(subscription, order, at + within)) &&
        !checkedBy(log, order, at + within),
    ),
  ];
}

// How many of the thing's listenings started and weren't stopped: each starts, unless it throws as
// it starts.
function stillListening({ thing: watched, setup: { listens } }: Log): number {
  const started = listens === "throws" ? 0 : watched.listened();

  return started - watched.stopped();
}

test("tells each subscriber what each check that started after it came finds, unless it's what it was last told, until it leaves, though checks fail or hang and listening fails", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.tuple(setup, setup),
      scenarios,
      stops,
      async (setups, scenario, stopAfter) => {
        const logs = await run(setups, scenario, stopAfter);

        expect(logs.flatMap(({ subscriptions }) => subscriptions.map(toldTo))).toStrictEqual(
          logs.flatMap((log) => log.subscriptions.map((subscription) => dueTo(subscription, log))),
        );
      },
    ),
  );
});

test("checks soon after each subscriber comes, and after each change it's told of, and never sooner after a check than a second, or ten times as long as it took", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.tuple(setup, setup),
      scenarios,
      stops,
      async (setups, scenario, stopAfter) => {
        const logs = await run(setups, scenario, stopAfter);

        expect(logs.map(unchecked)).toStrictEqual([[], []]);
        expect(
          logs.map(({ thing: watched, setup: { took } }) =>
            restsOnceTook(watched.checks).filter((rest) => rest < Math.min(1000, 10 * took)),
          ),
        ).toStrictEqual([[], []]);
      },
    ),
  );
});

test("unsubscribing all at any point makes no more checks, and leaves no timer or listening behind", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.tuple(setup, setup),
      scenarios,
      stops,
      async (setups, scenario, stopAfter) => {
        const logs = await run(setups, scenario, stopAfter);

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

test("rests a second at least, or ten times as long as a check took, before each check, while changes keep coming and a subscriber stays", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 300 }),
      fc.array(fc.integer({ min: 0, max: 3000 }), { maxLength: 20 }),
      async (took, gaps) => {
        const watched = thing(took);

        watched.subscribe();
        await changeAfter(watched, gaps);
        await pass(60_000);
        unsubscribeAll();

        expect(Math.min(...restsBetween(watched.checks))).toBeGreaterThanOrEqual(
          Math.max(1000, 10 * took),
        );
      },
    ),
  );
});
