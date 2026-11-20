import * as fc from "fast-check";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { refreshOnChanges } from "./refresh";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// What happens to a view: the changes are told to be at a version, what it shows is read at one, or
// it's told to stop refreshing.
type Happening =
  | { kind: "told"; version: string }
  | { kind: "read"; version: string }
  | { kind: "stop" };

// Few versions, so that the changes are often told to be at the one shown.
const version = fc.constantFrom("a", "b", "c");

const happening: fc.Arbitrary<Happening> = fc.oneof(
  { weight: 6, arbitrary: fc.record({ kind: fc.constant("told" as const), version }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("read" as const), version }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("stop" as const) }) },
);

// Each a while after the one before it.
const happenings = fc.array(fc.record({ after: fc.integer({ min: 0, max: 3000 }), happening }), {
  maxLength: 12,
});

// How each refresh in turn goes: how many milliseconds it takes, and whether it fails. Those after
// the last take none, and don't fail.
interface Outcome {
  takes: number;
  fails: boolean;
}

const outcomes = fc.array(
  fc.record({ takes: fc.integer({ min: 0, max: 3000 }), fails: fc.boolean() }),
  { maxLength: 12 },
);

// What the changes were last told to be at, what the view shows them at, by what it was first read
// at and the last refresh that didn't fail, and whether it's been told to stop.
interface State {
  told: string | undefined;
  shown: string | undefined;
  stopped: boolean;
}

// What happened, in order, and when, with the state after it, or for a refresh that began, before.
type Entry = State & { at: number } & (
    | { kind: "happened" }
    | { kind: "began"; version: string }
    | { kind: "ended"; failed: boolean; rested: number }
  );

async function elapsed(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

// How long a refresh that took the milliseconds should be rested after.
function restAfter(took: number, failed: boolean): number {
  return failed ? Math.max(1000, 2 * took) : 2 * took;
}

// What refreshOnChanges does as the happenings happen, with a refresh that goes as the outcomes
// say, until nothing is left for it to do.
async function run(
  given: readonly { after: number; happening: Happening }[],
  refreshes: readonly Outcome[],
): Promise<Entry[]> {
  const stopping = new AbortController();
  const start = Date.now();
  const log: Entry[] = [];
  const state: State = { told: undefined, shown: undefined, stopped: false };
  let began = 0;

  function now(): number {
    return Date.now() - start;
  }

  const following = refreshOnChanges(async (asked) => {
    const { takes, fails } = refreshes[began] ?? { takes: 0, fails: false };

    began += 1;
    log.push({ kind: "began", version: asked, at: now(), ...state });
    await elapsed(takes);

    if (!fails) {
      state.shown = asked;
    }

    log.push({
      kind: "ended",
      failed: fails,
      rested: restAfter(takes, fails),
      at: now(),
      ...state,
    });

    if (fails) {
      throw new Error("The refresh failed.");
    }
  }, stopping.signal);

  function happen(happened: Happening): void {
    switch (happened.kind) {
      case "told": {
        state.told = happened.version;
        log.push({ kind: "happened", at: now(), ...state });
        following.told(happened.version);
        break;
      }

      case "read": {
        state.shown ??= happened.version;
        log.push({ kind: "happened", at: now(), ...state });
        following.read(happened.version);
        break;
      }

      case "stop": {
        state.stopped = true;
        log.push({ kind: "happened", at: now(), ...state });
        stopping.abort();
        break;
      }
    }
  }

  async function take(rest: readonly { after: number; happening: Happening }[]): Promise<void> {
    const [next, ...later] = rest;

    if (next !== undefined) {
      await vi.advanceTimersByTimeAsync(next.after);
      happen(next.happening);
      await take(later);
    }
  }

  await take(given);
  await vi.runAllTimersAsync();

  return log;
}

// Whether a refresh is called for: what's shown has been read, the changes aren't at the version
// it's at, and it hasn't been told to stop.
function calledFor({ told, shown, stopped }: State): boolean {
  return !stopped && shown !== undefined && told !== undefined && told !== shown;
}

interface Busy {
  // When the rest after the last refresh that ended is over, or was, if one has.
  free: number;
  // Whether a refresh is under way.
  refreshing: boolean;
}

// As the entry at the index happens.
function busyAt(log: readonly Entry[], index: number): Busy {
  const last = log.slice(0, index).findLast(({ kind }) => kind !== "happened");

  return {
    free: last?.kind === "ended" ? last.at + last.rested : -Infinity,
    refreshing: last?.kind === "began",
  };
}

// The refreshes that began though none was called for, or for another version than the changes were
// last told to be at, or while another was under way.
function uncalledFor(log: readonly Entry[]): Entry[] {
  return log.filter(
    (entry, index) =>
      entry.kind === "began" &&
      !(calledFor(entry) && entry.version === entry.told && !busyAt(log, index).refreshing),
  );
}

// The refreshes that began before the rest after the one before was over.
function unrested(log: readonly Entry[]): Entry[] {
  return log.filter((entry, index) => entry.kind === "began" && entry.at < busyAt(log, index).free);
}

// What happened that called for a refresh, with none under way and the rest after the last over,
// without one beginning at once.
function leftWaiting(log: readonly Entry[]): Entry[] {
  return log.filter((entry, index) => {
    const { free, refreshing } = busyAt(log, index);
    const next = log[index + 1];

    return (
      entry.kind === "happened" &&
      calledFor(entry) &&
      !refreshing &&
      entry.at > free &&
      !(next?.kind === "began" && next.at === entry.at)
    );
  });
}

// The state as the rest after the refresh that ended at the entry is over, unless something
// happens just then, when it may be either side of that.
function stateOnceRested(log: readonly Entry[], index: number): State | undefined {
  const { free } = busyAt(log, index + 1);
  const until = log.slice(index + 1).filter(({ kind, at }) => kind === "happened" && at <= free);

  return until.some(({ at }) => at === free) ? undefined : (until.at(-1) ?? log[index]);
}

// The refreshes that ended with one called for as the rest after them was over, without one
// beginning then.
function leftRested(log: readonly Entry[]): Entry[] {
  return log.filter((entry, index) => {
    const state = stateOnceRested(log, index);
    const { free } = busyAt(log, index + 1);

    return (
      entry.kind === "ended" &&
      state !== undefined &&
      calledFor(state) &&
      !log.some(({ kind, at }) => kind === "began" && at === free)
    );
  });
}

test("refreshes one at a time, for the version the changes were last told to be at, and only while what's shown, once it's read, isn't at it, until it's told to stop", async () => {
  await fc.assert(
    fc.asyncProperty(happenings, outcomes, async (given, refreshes) => {
      expect(uncalledFor(await run(given, refreshes))).toStrictEqual([]);
    }),
  );
});

test("rests twice as long as a refresh took before the next, and a second at least after one that failed", async () => {
  await fc.assert(
    fc.asyncProperty(happenings, outcomes, async (given, refreshes) => {
      expect(unrested(await run(given, refreshes))).toStrictEqual([]);
    }),
    {
      examples: [
        [
          [
            { after: 0, happening: { kind: "read", version: "a" } },
            { after: 0, happening: { kind: "told", version: "b" } },
            { after: 400, happening: { kind: "told", version: "c" } },
          ],
          [{ takes: 300, fails: false }],
        ],
      ],
    },
  );
});

test("refreshes at once when a refresh comes to be called for, unless it's refreshing or resting", async () => {
  await fc.assert(
    fc.asyncProperty(happenings, outcomes, async (given, refreshes) => {
      expect(leftWaiting(await run(given, refreshes))).toStrictEqual([]);
    }),
    {
      examples: [
        [
          [
            { after: 0, happening: { kind: "told", version: "b" } },
            { after: 500, happening: { kind: "read", version: "a" } },
          ],
          [],
        ],
      ],
    },
  );
});

test("refreshes as soon as it has rested, if a refresh is called for then, as for a version told of meanwhile, or one whose refresh failed", async () => {
  await fc.assert(
    fc.asyncProperty(happenings, outcomes, async (given, refreshes) => {
      expect(leftRested(await run(given, refreshes))).toStrictEqual([]);
    }),
    {
      examples: [
        [
          [
            { after: 0, happening: { kind: "read", version: "a" } },
            { after: 0, happening: { kind: "told", version: "b" } },
          ],
          [
            { takes: 700, fails: true },
            { takes: 300, fails: true },
          ],
        ],
      ],
    },
  );
});

test("does nothing if the signal has said to stop already", async () => {
  const refresh = vi.fn<(asked: string) => Promise<void>>();
  const following = refreshOnChanges(refresh, AbortSignal.abort());

  following.read("a");
  following.told("b");
  await vi.runAllTimersAsync();

  expect(refresh).not.toHaveBeenCalled();
});
