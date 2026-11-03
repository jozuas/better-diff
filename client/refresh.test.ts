import * as fc from "fast-check";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { refreshOnChanges } from "./refresh";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// One wait for changes: the version it answers with, or undefined if it fails, whether the refresh
// it calls for, if any, fails, and how many milliseconds each takes.
interface Step {
  answer: string | undefined;
  waitTakes: number;
  refreshFails: boolean;
  refreshTakes: number;
}

// Few versions, so that a wait often answers with the one before.
const step: fc.Arbitrary<Step> = fc.record({
  answer: fc.option(fc.constantFrom("a", "b", "c"), { nil: undefined }),
  waitTakes: fc.integer({ min: 0, max: 3000 }),
  refreshFails: fc.boolean(),
  refreshTakes: fc.integer({ min: 0, max: 3000 }),
});

const steps = fc.array(step, { maxLength: 12 });

// The version what's shown was read at before the first wait, or an empty one, which none is.
const from = fc.constantFrom("", "a", "b");

// What the changes were at, by the last wait's answer, and what was shown, by the last refresh that
// didn't fail, or as read before the first wait.
interface State {
  changes: string | undefined;
  shown: string;
}

interface Wait extends State {
  version: string;
  timeout: number;
}

interface Run {
  // As each was asked.
  waits: Wait[];
  refreshes: State[];
  // The versions each refresh was asked to show.
  refreshedTo: string[];
  // The indices of the steps whose wait or refresh failed, and of those that refreshed.
  failed: Set<number>;
  refreshed: Set<number>;
  // How many milliseconds in each wait was asked, and each step ended: its wait, or the refresh it
  // called for.
  asked: number[];
  ended: number[];
  // The versions of the waits released.
  released: string[];
}

async function elapsed(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

// What refreshOnChanges asks of waits that answer as the steps say, in turn, and of a refresh that
// shows the changes as the last wait answered them, unless it fails, starting from what was read at
// `shown`. The wait after the steps answers with a version none of them did, once the signal has
// said to stop while it waits.
async function run(given: readonly Step[], shown = ""): Promise<Run> {
  const stopping = new AbortController();
  const start = Date.now();

  const ran: Run = {
    waits: [],
    refreshes: [],
    refreshedTo: [],
    failed: new Set(),
    refreshed: new Set(),
    asked: [],
    ended: [],
    released: [],
  };

  const state: State = { changes: undefined, shown };
  const last: Step = { answer: "stopped", waitTakes: 0, refreshFails: false, refreshTakes: 0 };

  function now(): number {
    return Date.now() - start;
  }

  // The step's index, and its end so far, once it's taken its time.
  async function taken(milliseconds: number): Promise<number> {
    const index = ran.waits.length - 1;

    await elapsed(milliseconds);
    ran.ended[index] = now();

    return index;
  }

  refreshOnChanges(
    {
      wait: async ({ version, timeout }) => {
        const { answer, waitTakes } = given[ran.waits.length] ?? last;

        ran.waits.push({ ...state, version, timeout });
        ran.asked.push(now());

        const index = await taken(waitTakes);

        if (index === given.length) {
          stopping.abort();
        }

        if (answer === undefined) {
          ran.failed.add(index);

          throw new Error("The wait failed.");
        }

        state.changes = answer;

        return { version: answer };
      },
      release: async (version) => {
        ran.released.push(version);
        await elapsed(0);
      },
    },
    async (version) => {
      const { refreshFails, refreshTakes } = given[ran.waits.length - 1] ?? last;

      ran.refreshes.push({ ...state });
      ran.refreshedTo.push(version);
      ran.refreshed.add(ran.waits.length - 1);

      const index = await taken(refreshTakes);

      if (refreshFails) {
        ran.failed.add(index);

        throw new Error("The refresh failed.");
      }

      state.shown = version;
    },
    shown,
    stopping.signal,
  );

  await vi.runAllTimersAsync();

  return ran;
}

// The waits asked while what was shown wasn't the changes as the wait before answered them, though
// nothing failed in its step.
function outOfDate({ waits, failed }: Run): Wait[] {
  return waits.filter(
    ({ changes, shown }, index) => index > 0 && changes !== shown && !failed.has(index - 1),
  );
}

// How many milliseconds after each step ended the next wait was asked.
function pauses({ asked, ended }: Run): number[] {
  return asked.slice(1).map((at, index) => at - (ended[index] ?? Number.NaN));
}

// How many milliseconds each step's next wait should be asked after it ends: a second after a wait
// fails, twice as long as a refresh took after one, but a second at least after one that fails.
function rests(given: readonly Step[], { failed, refreshed }: Run): number[] {
  return given.map(({ refreshFails, refreshTakes }, index) => {
    if (!refreshed.has(index)) {
      return failed.has(index) ? 1000 : 0;
    }

    return refreshFails ? Math.max(1000, 2 * refreshTakes) : 2 * refreshTakes;
  });
}

test("refreshes only while what's shown isn't the changes as the last wait answered", async () => {
  await fc.assert(
    fc.asyncProperty(steps, from, async (given, shown) => {
      const { refreshes } = await run(given, shown);

      expect(refreshes.filter(({ changes, shown: then }) => changes === then)).toStrictEqual([]);
    }),
  );
});

test("refreshes to show the changes as the last wait answered them", async () => {
  await fc.assert(
    fc.asyncProperty(steps, from, async (given, shown) => {
      const { refreshes, refreshedTo } = await run(given, shown);

      expect(refreshedTo).toStrictEqual(refreshes.map(({ changes }) => changes));
    }),
  );
});

test("waits from the version shown, starting from the one what's shown was read at", async () => {
  await fc.assert(
    fc.asyncProperty(steps, from, async (given, shown) => {
      const { waits } = await run(given, shown);

      expect(waits.map(({ version }) => version)).toStrictEqual(
        waits.map(({ shown: then }) => then),
      );
    }),
  );
});

test("shows the changes as a wait answers them before it waits again, unless that fails", async () => {
  await fc.assert(
    fc.asyncProperty(steps, from, async (given, shown) => {
      expect(outOfDate(await run(given, shown))).toStrictEqual([]);
    }),
    {
      examples: [
        [[{ answer: "a", waitTakes: 0, refreshFails: false, refreshTakes: 0 }], ""],
        [
          [
            { answer: "a", waitTakes: 0, refreshFails: true, refreshTakes: 0 },
            { answer: "a", waitTakes: 0, refreshFails: false, refreshTakes: 0 },
          ],
          "",
        ],
      ],
    },
  );
});

test("waits again at once, twice as long as a refresh took after one, and a second at least after a wait or a refresh fails", async () => {
  await fc.assert(
    fc.asyncProperty(steps, from, async (given, shown) => {
      const ran = await run(given, shown);

      expect(pauses(ran)).toStrictEqual(rests(given, ran));
    }),
    {
      examples: [
        [[{ answer: "a", waitTakes: 0, refreshFails: true, refreshTakes: 700 }], ""],
        [[{ answer: "a", waitTakes: 0, refreshFails: true, refreshTakes: 300 }], ""],
      ],
    },
  );
});

test("asks each wait to last 50 seconds if nothing changes, as long as changes.wait allows", async () => {
  await fc.assert(
    fc.asyncProperty(steps, from, async (given, shown) => {
      const { waits } = await run(given, shown);

      expect(waits.map(({ timeout }) => timeout)).toStrictEqual(waits.map(() => 50_000));
    }),
  );
});

test("neither refreshes nor waits again once the signal says to stop, though a wait answers with another version then, and releases that wait", async () => {
  await fc.assert(
    fc.asyncProperty(steps, from, async (given, shown) => {
      const { waits, refreshes, released } = await run(given, shown);

      expect(waits).toHaveLength(given.length + 1);
      expect(refreshes.filter(({ changes }) => changes === "stopped")).toStrictEqual([]);
      expect(released).toStrictEqual([waits.at(-1)?.version]);
    }),
  );
});

test("releases no wait once the signal says to stop while it refreshes", async () => {
  const stopping = new AbortController();
  const release = vi.fn<(version: string) => Promise<void>>();

  refreshOnChanges(
    {
      wait: async () => {
        await elapsed(10);

        return { version: "a" };
      },
      release,
    },
    async () => {
      stopping.abort();
      await elapsed(100);
    },
    "",
    stopping.signal,
  );
  await vi.runAllTimersAsync();

  expect(release).not.toHaveBeenCalled();
});

test("waits for nothing if the signal has said to stop already", async () => {
  const wait = vi.fn<(input: { version: string }) => Promise<{ version: string }>>();

  refreshOnChanges({ wait, release: async () => {} }, async () => {}, "", AbortSignal.abort());
  await vi.runAllTimersAsync();

  expect(wait).not.toHaveBeenCalled();
});
