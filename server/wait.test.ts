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

test("answers at once with the version now when given another", async () => {
  const watched = thing(10);
  const answer = watched.wait("0");

  await pass(10);

  expect(answered(answer)).toStrictEqual({ version: "1", at: 10, failed: false });
});

test("answers with the same version once the wait is over, when nothing has changed", async () => {
  const watched = thing(10);
  const answer = watched.wait("1", 5000);

  await pass(5000);

  expect(answered(answer)).toStrictEqual({ version: "1", at: 5000, failed: false });
  expect(watched.starts()).toStrictEqual([0, 1010]);
});

test("answers a wait over before its first check with what that check finds, however long it has to wait for it", async () => {
  const watched = thing(100);
  const first = watched.wait("1");

  await pass(50);

  const second = watched.wait("1", 0);

  await pass(1150);

  expect(answered(second)).toStrictEqual({ version: "1", at: 1200, failed: false });
  expect(first.at).toBeUndefined();
  expect(watched.starts()).toStrictEqual([0, 1100]);
});

test("answers a waiter that asks while a check runs from a check that starts after it asked", async () => {
  const watched = thing(100);
  const first = watched.wait("1");

  await pass(50);
  watched.set("2");

  const second = watched.wait("0");

  await pass(1150);

  expect(answered(first)).toStrictEqual({ version: "2", at: 1200, failed: false });
  expect(answered(second)).toStrictEqual({ version: "2", at: 1200, failed: false });
  expect(watched.starts()).toStrictEqual([0, 1100]);
});

test("waiters that ask before a check starts share it", async () => {
  const watched = thing(10);
  const first = [watched.wait("0"), watched.wait("0"), watched.wait("0")];

  await pass(50);

  const second = watched.wait("0");

  await pass(10);

  const third = watched.wait("0");

  await pass(60);

  expect(first.map(answered)).toStrictEqual(
    Array.from({ length: 3 }, () => ({ version: "1", at: 10, failed: false })),
  );
  expect([second, third].map(answered)).toStrictEqual(
    Array.from({ length: 2 }, () => ({ version: "1", at: 120, failed: false })),
  );
  expect(watched.starts()).toStrictEqual([0, 110]);
});

// The first check started before listening did, so it may have missed a change made in between.
test("where something tells of changes, checks a second after it starts to, and then only once told, or half a minute after the last check", async () => {
  const watched = thing(10);

  watched.wait("1");
  await pass(31_019);

  expect(watched.starts()).toStrictEqual([0, 1010]);

  await pass(1);

  expect(watched.starts()).toStrictEqual([0, 1010, 31_020]);
});

test("checks at once, and every second, while listening starts, and a second after it has started", async () => {
  const watched = thing(10, "tells", 2500);

  watched.wait("1");
  await pass(33_039);

  expect(watched.starts()).toStrictEqual([0, 1010, 2020, 3030]);

  await pass(1);

  expect(watched.starts()).toStrictEqual([0, 1010, 2020, 3030, 33_040]);
});

test("checks as soon as told of a change, but no sooner than a second after the last check", async () => {
  const watched = thing(10);
  const first = watched.wait("1");

  await pass(500);
  watched.set("2");
  watched.changed();
  await pass(520);

  const second = watched.wait("2");

  await pass(3980);
  watched.set("3");
  watched.changed();
  await pass(10);

  expect(answered(first)).toStrictEqual({ version: "2", at: 1020, failed: false });
  expect(answered(second)).toStrictEqual({ version: "3", at: 5010, failed: false });
  expect(watched.starts()).toStrictEqual([0, 1010, 5000]);
});

// A client asks again with the version it was given as soon as it's given one.
test("checks for a waiter who asks with the version the last check found only once told of a change, and ten times as long as a slow check took after it", async () => {
  const watched = thing(200);

  watched.wait("0");
  await pass(200);

  const again = watched.wait("1");

  await pass(100);
  watched.set("2");
  watched.changed();
  await pass(2100);

  expect(answered(again)).toStrictEqual({ version: "2", at: 2400, failed: false });
  expect(watched.starts()).toStrictEqual([0, 2200]);
});

test("checks for waiters who ask with the version the last check found so that the check ends as the first of their waits does, where nothing tells of a change", async () => {
  const watched = thing(100);

  watched.wait("1", 2000);
  await pass(3000);

  const sooner = watched.wait("1", 5000);
  const later = watched.wait("1", 8000);

  await pass(8000);

  expect([sooner, later].map(answered)).toStrictEqual([
    { version: "1", at: 8000, failed: false },
    { version: "1", at: 11_000, failed: false },
  ]);
  expect(watched.starts()).toStrictEqual([0, 1100, 7900]);
});

test("after a slow check, waits ten times as long as it took before a check it's told to make, and a second before one a waiter asks for", async () => {
  const watched = thing(200);
  const first = watched.wait("1");

  await pass(300);
  watched.set("2");
  watched.changed();
  await pass(2100);

  const second = watched.wait("0");

  await pass(1200);

  expect(answered(first)).toStrictEqual({ version: "2", at: 2400, failed: false });
  expect(answered(second)).toStrictEqual({ version: "2", at: 3600, failed: false });
  expect(watched.starts()).toStrictEqual([0, 2200, 3400]);
});

test.each([
  [10, [0, 1010, 2020, 3030, 4040]],
  [200, [0, 2200, 4400]],
])(
  "where nothing tells of changes, checks a second after the last check, or ten times as long as it took, after %ims checks",
  async (took, starts) => {
    const watched = thing(took, "fails");

    watched.wait("1");
    await pass(4500);

    expect(watched.starts()).toStrictEqual(starts);
    expect([watched.listened(), watched.stopped()]).toStrictEqual([1, 1]);
  },
);

test("checks every second once what told of changes fails to, and stops it", async () => {
  const watched = thing(10);

  watched.wait("1");
  await pass(5000);
  watched.failed();
  await pass(1010);

  expect(watched.starts()).toStrictEqual([0, 1010, 5000, 6010]);
  expect(watched.stopped()).toBe(1);
});

// The first check a minute after listening failed, as it started, is the one at 60_600ms.
test("checks every second where listening throws as it starts, and listens anew a minute after", async () => {
  const watched = thing(10, "throws");

  watched.wait("1", 100_000);
  await pass(4500);

  expect(watched.starts()).toStrictEqual([0, 1010, 2020, 3030, 4040]);

  await pass(56_099);

  expect(watched.listened()).toBe(1);

  await pass(1);

  expect(watched.listened()).toBe(2);
});

// Checks made every second after 5000ms, the first a minute after it failed at 65_600ms.
test("listens anew a minute after listening failed, while a waiter waits", async () => {
  const watched = thing(10);

  watched.wait("1", 100_000);
  await pass(5000);
  watched.failed();
  await pass(60_599);

  expect(watched.listened()).toBe(1);

  await pass(1);

  expect(watched.listened()).toBe(2);
});

test("checks sooner for a waiter that asks while the watch rests", async () => {
  const watched = thing(10);

  watched.wait("1");
  await pass(5000);

  const answer = watched.wait("0");

  await pass(10);

  expect(answered(answer)).toStrictEqual({ version: "1", at: 5010, failed: false });
  expect(watched.starts()).toStrictEqual([0, 1010, 5000]);
});

test("answers a waiter once its wait is over, though a check runs for another", async () => {
  const watched = thing(100);
  const first = watched.wait("1", 2500);

  await pass(2450);

  const second = watched.wait("0");

  await pass(100);

  expect(answered(first)).toStrictEqual({ version: "1", at: 2500, failed: false });
  expect(answered(second)).toStrictEqual({ version: "1", at: 2550, failed: false });
  expect(watched.starts()).toStrictEqual([0, 1100, 2450]);
});

test("keeps listening for a minute once no waiter is left, for the next waiter", async () => {
  const watched = thing(10);

  watched.wait("0");
  await pass(30_000);
  watched.wait("0");
  await pass(60_009);

  expect([watched.listened(), watched.stopped()]).toStrictEqual([1, 0]);

  await pass(1);

  expect([watched.listened(), watched.stopped()]).toStrictEqual([1, 1]);

  watched.wait("0");
  await pass(10);

  expect([watched.listened(), watched.stopped()]).toStrictEqual([2, 1]);
});

test("keeps listening while a waiter waits, though a minute has passed since an earlier one left", async () => {
  const watched = thing(10);

  watched.wait("0");
  await pass(30_000);
  watched.wait("1");
  await pass(45_000);

  expect(watched.stopped()).toBe(0);
});

test("stops listening a minute after the last waiter's wait is over", async () => {
  const watched = thing(10);

  watched.wait("1", 5000);
  await pass(65_000);

  expect(watched.stopped()).toBe(1);
});

// Listening that keeps failing, as where the system has no more watches to give, would take the
// watches it could each time.
test("listens anew for a waiter no sooner than a minute after listening failed", async () => {
  const watched = thing(10, "fails");

  watched.wait("0");
  await pass(10);
  watched.wait("0");
  await pass(59_990);

  expect([watched.listened(), watched.stopped()]).toStrictEqual([1, 1]);

  watched.wait("0");
  await pass(10);

  expect([watched.listened(), watched.stopped()]).toStrictEqual([2, 2]);
});

test("fails the waiters a failed check was for, and keeps the others waiting", async () => {
  const watched = thing(100);

  watched.failChecks(true);

  const first = watched.wait("0");

  await pass(50);

  const second = watched.wait("0");

  watched.failChecks(false);
  await pass(1150);

  expect(answered(first)).toStrictEqual({ version: undefined, at: 100, failed: true });
  expect(answered(second)).toStrictEqual({ version: "1", at: 1200, failed: false });
});

test("leaves only the timers of the rest and of the wait while told of changes", async () => {
  const watched = thing(10);

  watched.wait("1");
  await pass(2000);
  watched.changed();
  await pass(1);
  watched.changed();
  await pass(1);
  watched.changed();
  await pass(1);

  expect(vi.getTimerCount()).toBe(2);
});

test("leaves only the timer of the listening once its waiters are answered", async () => {
  const watched = thing(10);

  watched.wait("0");
  await pass(10);

  expect(vi.getTimerCount()).toBe(1);
});

// A wait from version 0 is answered at once with version 1, and the watch lingers.
test.each([
  ["resting", 10, "1", 2000],
  ["checking", 100, "1", 50],
  ["lingering", 10, "0", 2000],
])(
  "stopping waiting while %s answers each wait, with its own version if not before, and leaves no timer or listening behind",
  async (_, took, from, after) => {
    const watched = thing(took);
    const answer = watched.wait(from);

    await pass(after);
    stopWaiting();
    await pass(took);

    expect(answer).toMatchObject({ version: "1", failed: false });
    expect(vi.getTimerCount()).toBe(0);
    expect(watched.stopped()).toBe(1);
  },
);

test("stopping waiting before the first check answers each wait with its own version, and listens to nothing", async () => {
  const watched = thing(10);
  const answer = watched.wait("0");

  stopWaiting();
  await pass(10);

  expect(answered(answer)).toStrictEqual({ version: "0", at: 0, failed: false });
  expect([watched.listened(), watched.starts()]).toStrictEqual([0, []]);
});

test("stopping waiting stops listening that's starting once it has started", async () => {
  const watched = thing(10, "tells", 2500);

  watched.wait("1");
  await pass(100);
  stopWaiting();
  await pass(2500);

  expect([watched.listened(), watched.stopped()]).toStrictEqual([1, 1]);
});

test("a wait after waiting stopped listens anew", async () => {
  const watched = thing(10);

  watched.wait("1");
  await pass(2000);
  stopWaiting();
  watched.wait("1");
  await pass(10);

  expect([watched.listened(), watched.stopped()]).toStrictEqual([2, 1]);
});
