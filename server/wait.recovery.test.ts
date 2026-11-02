import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { answered, pass, thing } from "../test/watched";
import { stopWaiting } from "./wait";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  stopWaiting();
  vi.useRealTimers();
});

// Checks start at 0ms, at 1010ms, once listening has started, and at 2020ms, once told of a change.
// That one hangs, as git status can on a hook. The second wait is long, so that the check it's
// answered by is due as the change it's told of calls for, and not as its wait is over.
test("stops a check that takes a minute, fails the waits it was for, and rests after it as long as before it", async () => {
  const watched = thing(10);
  const first = watched.wait("1", 100_000);

  await pass(2000);
  watched.hangChecks(true);
  watched.changed();
  await pass(60_020);

  expect(answered(first)).toStrictEqual({ version: undefined, at: 62_020, failed: true });
  expect(watched.checks.map(({ stopped }) => stopped)).toStrictEqual([false, false, true]);

  watched.hangChecks(false);
  watched.set("2");

  const second = watched.wait("1", 1_000_000);

  watched.changed();
  await pass(1010);

  expect(answered(second)).toStrictEqual({ version: "2", at: 63_030, failed: false });
  expect(watched.starts()).toStrictEqual([0, 1010, 2020, 63_020]);
});

// Nothing tells of the change made at 5000ms, which the check half a minute after the last, at
// 31_020ms, finds.
test("listens anew once a check finds a change it wasn't told of", async () => {
  const watched = thing(10);
  const stop = watched.keepWaiting("1");

  await pass(5000);
  watched.set("2");
  await pass(30_000);
  stop();

  expect(watched.listenings()).toStrictEqual([0, 31_030]);
  expect(watched.stopped()).toBe(1);
});

// The check at 31_200ms is told of the change made just before it started as it runs, and the one
// at 32_300ms finds the same.
test.each([
  ["", 10, 5000, 0],
  [" as the check that finds it runs", 100, 31_150, 100],
])("keeps listening where it's told of a change%s", async (_, took, changedAt, toldAfter) => {
  const watched = thing(took);
  const stop = watched.keepWaiting("1");

  await pass(changedAt);
  watched.set("2");
  await pass(toldAfter);
  watched.changed();
  await pass(40_000);
  stop();

  expect(watched.listenings()).toStrictEqual([0]);
});

// Checks half a minute apart find what the one before did.
test("keeps listening where nothing changes", async () => {
  const watched = thing(10);
  const stop = watched.keepWaiting("1");

  await pass(100_000);
  stop();

  expect(watched.listenings()).toStrictEqual([0]);
});

test("keeps listening where a change is found while listening fails, as checks are made every second", async () => {
  const watched = thing(10, "fails");
  const stop = watched.keepWaiting("1");

  await pass(2500);
  watched.set("2");
  await pass(2500);
  stop();

  expect(watched.listenings()).toStrictEqual([0]);
});

// Checks are made every 1010ms from 5000ms, once listening has failed, and from 70_000ms, once it
// has failed again.
test("listens anew a minute after listening that told of changes fails, each time", async () => {
  const watched = thing(10);

  watched.wait("1", 1_000_000);
  await pass(5000);
  watched.failed();
  await pass(65_000);
  watched.failed();
  await pass(70_000);

  expect(watched.listenings().map((at) => Math.floor(at / 10_000) * 10_000)).toStrictEqual([
    0, 60_000, 130_000,
  ]);
});

// Each listening throws as it starts. Checks are made every 1010ms, and it listens anew as the
// first after it's due to starts, which is never 10s late, however many times it listened before.
test("listens anew twice as long after listening that failed before it told of anything as after the one before it, up to an hour", async () => {
  const watched = thing(10, "throws");

  watched.wait("1", 20_000_000);
  await pass(11_000_000);

  expect(watched.listenings().map((at) => Math.floor(at / 10_000) * 10_000)).toStrictEqual([
    0, 60_000, 180_000, 420_000, 900_000, 1_860_000, 3_780_000, 7_380_000, 10_980_000,
  ]);
});
