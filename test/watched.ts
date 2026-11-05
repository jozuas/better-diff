import { randomUUID } from "node:crypto";

import { vi } from "vitest";

import { changeFrom, release } from "../server/wait";
import type { Watched } from "../server/wait";

// The order in which waiters ask, checks start and versions change, across things.
let order = 0;

export function nextInOrder(): number {
  order += 1;

  return order;
}

export interface Check {
  order: number;
  started: number;
  // When it ended, or was told to stop.
  ended: number;
  // The version as the check started, which it finds unless it fails.
  version: string;
  // Whether it was told to stop, and whether it failed, as one told to stop does.
  stopped: boolean;
  failed: boolean;
}

export interface Answer {
  order: number;
  asked: number;
  version: string | undefined;
  failed: boolean;
  at: number | undefined;
}

export interface Thing {
  // Each check, as it starts.
  checks: Check[];
  // The time since the thing was made.
  now: () => number;
  // When each check started.
  starts: () => number[];
  set: (version: string) => void;
  // Has the checks that start from now fail, or not, and never end, or not.
  failChecks: (fails: boolean) => void;
  hangChecks: (hangs: boolean) => void;
  // Has its listener tell of a change, or fail.
  changed: () => void;
  failed: () => void;
  // How many times it was listened to, when, and how many times listening stopped.
  listened: () => number;
  listenings: () => number[];
  stopped: () => number;
  // Waits for a change from the version given, saying what it was answered with, and when.
  wait: (from: string, timeout?: number) => Answer;
  // Waits for a change from the version given, and from each it's answered with as soon as it's
  // answered, until the function it gives is called.
  keepWaiting: (from: string) => () => void;
  // Releases the waits from the version given.
  release: (from: string) => void;
}

// How its listener does: tells of changes when the test says, fails to, or throws as it starts.
export type Listens = "tells" | "fails" | "throws";

// Something to watch, whose checks take `took` milliseconds each, and whose listener takes
// `starts` milliseconds to start, and listens as `listens` says. Times are from when it's made.
export function thing(took: number, listens: Listens = "tells", starts = 0): Thing {
  const key = randomUUID();
  const origin = performance.now();
  const checks: Check[] = [];
  let version = "1";
  let failing = false;
  let hanging = false;
  const listenings: number[] = [];
  let stopped = 0;
  let tell = { changed: () => {}, failed: () => {} };

  function now(): number {
    return performance.now() - origin;
  }

  const watched: Watched = {
    check: async (stop) => {
      const found = version;
      const fails = failing;
      const hangs = hanging;

      const check = {
        order: nextInOrder(),
        started: now(),
        ended: Number.NaN,
        version: found,
        stopped: false,
        failed: false,
      };

      stop.addEventListener("abort", () => {
        check.stopped = true;
        check.failed = true;
        check.ended = now();
      });
      checks.push(check);
      await new Promise((resolve) => {
        if (!hangs) {
          setTimeout(resolve, took);
        }
      });
      check.ended = now();

      if (fails) {
        check.failed = true;
        throw new Error("git status failed");
      }

      return found;
    },
    listen: async (changed, failed) => {
      listenings.push(now());
      tell = { changed, failed };

      if (listens === "fails") {
        failed();
      }

      await (starts > 0
        ? new Promise((resolve) => {
            setTimeout(resolve, starts);
          })
        : Promise.resolve());

      if (listens === "throws") {
        throw new Error("No more watches");
      }

      return () => {
        stopped += 1;
      };
    },
  };

  return {
    checks,
    now,
    starts: () => checks.map(({ started }) => started),
    set: (changed) => {
      version = changed;
    },
    failChecks: (fails) => {
      failing = fails;
    },
    hangChecks: (hangs) => {
      hanging = hangs;
    },
    changed: () => {
      tell.changed();
    },
    failed: () => {
      tell.failed();
    },
    listened: () => listenings.length,
    listenings: () => [...listenings],
    stopped: () => stopped,
    wait: (from, timeout = 50_000) => {
      const answer: Answer = {
        order: nextInOrder(),
        asked: now(),
        version: undefined,
        failed: false,
        at: undefined,
      };

      void (async () => {
        try {
          answer.version = await changeFrom(key, watched, from, timeout);
        } catch {
          answer.failed = true;
        }

        answer.at = now();
      })();

      return answer;
    },
    keepWaiting: (from) => {
      let waiting = true;

      async function waitFrom(asked: string): Promise<void> {
        const changed = await changeFrom(key, watched, asked, 50_000);

        if (waiting) {
          await waitFrom(changed);
        }
      }

      void waitFrom(from);

      return () => {
        waiting = false;
      };
    },
    release: (from) => {
      release(key, from);
    },
  };
}

// Lets the time pass, under Vitest's fake timers, and whatever it's time for run.
export async function pass(milliseconds: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(milliseconds);
}

export function answered(answer: Answer): Pick<Answer, "version" | "at" | "failed"> {
  return { version: answer.version, at: answer.at, failed: answer.failed };
}
