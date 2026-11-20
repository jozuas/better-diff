import { randomUUID } from "node:crypto";

import { vi } from "vitest";

import { subscribe } from "../server/subscribers";
import type { Watched } from "../server/subscribers";

// The order in which subscribers come, leave and are told, checks start and end, and versions
// change, across things.
let order = 0;

export function nextInOrder(): number {
  order += 1;

  return order;
}

export interface Check {
  order: number;
  started: number;
  // When it ended, or was told to stop, and where that was in the order, once it has.
  ended: number;
  endedOrder: number;
  // The version as the check started, which it finds unless it fails.
  version: string;
  // Whether it was told to stop, and whether it failed, as one told to stop does.
  stopped: boolean;
  failed: boolean;
}

interface Told {
  order: number;
  version: string;
  at: number;
}

export interface Subscription {
  order: number;
  subscribed: number;
  // Each version it was told, as it was.
  told: Told[];
  // When it left, and where that was in the order, once it has.
  left: number | undefined;
  leftOrder: number | undefined;
  leave: () => void;
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
  // Subscribes to its version, saying what it's told, and when.
  subscribe: () => Subscription;
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
        endedOrder: Number.NaN,
        version: found,
        stopped: false,
        failed: false,
      };

      stop.addEventListener("abort", () => {
        check.stopped = true;
        check.failed = true;
        check.ended = now();
        check.endedOrder = nextInOrder();
      });
      checks.push(check);
      await new Promise((resolve) => {
        if (!hangs) {
          setTimeout(resolve, took);
        }
      });
      check.ended = now();
      check.endedOrder = nextInOrder();

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
    subscribe: () => {
      const subscription: Subscription = {
        order: nextInOrder(),
        subscribed: now(),
        told: [],
        left: undefined,
        leftOrder: undefined,
        leave: () => {},
      };

      const leave = subscribe(key, watched, (told) => {
        subscription.told.push({ order: nextInOrder(), version: told, at: now() });
      });

      subscription.leave = () => {
        subscription.left = now();
        subscription.leftOrder = nextInOrder();
        leave();
      };

      return subscription;
    },
  };
}

// Lets the time pass, under Vitest's fake timers, and whatever it's time for run.
export async function pass(milliseconds: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(milliseconds);
}

// What the subscription was told, and when.
export function toldTo({ told }: Subscription): [string, number][] {
  return told.map(({ version, at }) => [version, at]);
}
