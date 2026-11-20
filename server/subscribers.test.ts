import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { pass, thing, toldTo } from "../test/watched";
import { unsubscribeAll } from "./subscribers";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  unsubscribeAll();
  vi.useRealTimers();
});

test("tells a subscriber the version now at once", async () => {
  const watched = thing(10);
  const subscription = watched.subscribe();

  await pass(10);

  expect(toldTo(subscription)).toStrictEqual([["1", 10]]);
});

test("tells a subscriber no version again while nothing changes", async () => {
  const watched = thing(10);
  const subscription = watched.subscribe();

  await pass(100_000);

  expect(toldTo(subscription)).toStrictEqual([["1", 10]]);
  expect(watched.starts()).toStrictEqual([0, 1010, 31_020, 61_030, 91_040]);
});

test("tells a subscriber that comes while a check runs from a check that starts after it came", async () => {
  const watched = thing(100);
  const first = watched.subscribe();

  await pass(50);
  watched.set("2");

  const second = watched.subscribe();

  await pass(1150);

  expect(toldTo(first)).toStrictEqual([
    ["1", 100],
    ["2", 1200],
  ]);
  expect(toldTo(second)).toStrictEqual([["2", 1200]]);
  expect(watched.starts()).toStrictEqual([0, 1100]);
});

test("subscribers that come before a check starts share it", async () => {
  const watched = thing(10);
  const first = [watched.subscribe(), watched.subscribe(), watched.subscribe()];

  await pass(50);

  const second = watched.subscribe();

  await pass(10);

  const third = watched.subscribe();

  await pass(60);

  expect(first.map(toldTo)).toStrictEqual(Array.from({ length: 3 }, () => [["1", 10]]));
  expect([second, third].map(toldTo)).toStrictEqual(Array.from({ length: 2 }, () => [["1", 120]]));
  expect(watched.starts()).toStrictEqual([0, 110]);
});

// The first check started before listening did, so it may have missed a change made in between.
test("where something tells of changes, checks a second after it starts to, and then only once told, or half a minute after the last check", async () => {
  const watched = thing(10);

  watched.subscribe();
  await pass(31_019);

  expect(watched.starts()).toStrictEqual([0, 1010]);

  await pass(1);

  expect(watched.starts()).toStrictEqual([0, 1010, 31_020]);
});

test("checks at once, and every second, while listening starts, and a second after it has started", async () => {
  const watched = thing(10, "tells", 2500);

  watched.subscribe();
  await pass(33_039);

  expect(watched.starts()).toStrictEqual([0, 1010, 2020, 3030]);

  await pass(1);

  expect(watched.starts()).toStrictEqual([0, 1010, 2020, 3030, 33_040]);
});

test("checks as soon as told of a change, but no sooner than a second after the last check, and tells of the version it finds", async () => {
  const watched = thing(10);
  const subscription = watched.subscribe();

  await pass(500);
  watched.set("2");
  watched.changed();
  await pass(4500);
  watched.set("3");
  watched.changed();
  await pass(10);

  expect(toldTo(subscription)).toStrictEqual([
    ["1", 10],
    ["2", 1020],
    ["3", 5010],
  ]);
  expect(watched.starts()).toStrictEqual([0, 1010, 5000]);
});

test("after a slow check, waits ten times as long as it took before a check it's told to make, and a second before one for a new subscriber", async () => {
  const watched = thing(200);
  const first = watched.subscribe();

  await pass(300);
  watched.set("2");
  watched.changed();
  await pass(2100);

  const second = watched.subscribe();

  await pass(1200);

  expect(toldTo(first)).toStrictEqual([
    ["1", 200],
    ["2", 2400],
  ]);
  expect(toldTo(second)).toStrictEqual([["2", 3600]]);
  expect(watched.starts()).toStrictEqual([0, 2200, 3400]);
});

test.each([
  [10, [0, 1010, 2020, 3030, 4040]],
  [200, [0, 2200, 4400]],
])(
  "where nothing tells of changes, checks a second after the last check, or ten times as long as it took, after %ims checks",
  async (took, starts) => {
    const watched = thing(took, "fails");

    watched.subscribe();
    await pass(4500);

    expect(watched.starts()).toStrictEqual(starts);
    expect([watched.listened(), watched.stopped()]).toStrictEqual([1, 1]);
  },
);

test("checks every second once what told of changes fails to, and stops it", async () => {
  const watched = thing(10);

  watched.subscribe();
  await pass(5000);
  watched.failed();
  await pass(1010);

  expect(watched.starts()).toStrictEqual([0, 1010, 5000, 6010]);
  expect(watched.stopped()).toBe(1);
});

// The first check a minute after listening failed, as it started, is the one at 60_600ms.
test("checks every second where listening throws as it starts, and listens anew a minute after", async () => {
  const watched = thing(10, "throws");

  watched.subscribe();
  await pass(4500);

  expect(watched.starts()).toStrictEqual([0, 1010, 2020, 3030, 4040]);

  await pass(56_099);

  expect(watched.listened()).toBe(1);

  await pass(1);

  expect(watched.listened()).toBe(2);
});

// Checks made every second after 5000ms, the first a minute after it failed at 65_600ms.
test("listens anew a minute after listening failed, while a subscriber stays", async () => {
  const watched = thing(10);

  watched.subscribe();
  await pass(5000);
  watched.failed();
  await pass(60_599);

  expect(watched.listened()).toBe(1);

  await pass(1);

  expect(watched.listened()).toBe(2);
});

test("checks sooner for a subscriber that comes while the watch rests, and tells the others nothing they were told", async () => {
  const watched = thing(10);
  const first = watched.subscribe();

  await pass(5000);

  const second = watched.subscribe();

  await pass(10);

  expect(toldTo(first)).toStrictEqual([["1", 10]]);
  expect(toldTo(second)).toStrictEqual([["1", 5010]]);
  expect(watched.starts()).toStrictEqual([0, 1010, 5000]);
});

// The check at 3030ms finds a version nothing told of, so it listens anew, and checks a second
// after that has started.
test("checks again a second after a check that failed, for a subscriber not yet told, and tells it once one doesn't", async () => {
  const watched = thing(10);

  watched.failChecks(true);

  const subscription = watched.subscribe();

  await pass(3000);

  expect(toldTo(subscription)).toStrictEqual([]);

  watched.failChecks(false);
  await pass(40_000);

  expect(toldTo(subscription)).toStrictEqual([["1", 3040]]);
  expect(watched.starts()).toStrictEqual([0, 1010, 2020, 3030, 4040, 34_050]);
});

// The check the change at 2000ms calls for fails, and nothing tells of the change again.
test("checks again a second after a check that failed, though nothing tells of a change again", async () => {
  const watched = thing(10);
  const subscription = watched.subscribe();

  await pass(2000);
  watched.failChecks(true);
  watched.set("2");
  watched.changed();
  await pass(100);
  watched.failChecks(false);
  await pass(1000);

  expect(toldTo(subscription)).toStrictEqual([
    ["1", 10],
    ["2", 3040],
  ]);
  expect(watched.starts()).toStrictEqual([0, 1010, 2020, 3030]);
});

test("leaves only the timer of the rest while told of changes", async () => {
  const watched = thing(10);

  watched.subscribe();
  await pass(2000);
  watched.changed();
  await pass(1);
  watched.changed();
  await pass(1);
  watched.changed();
  await pass(1);

  expect(vi.getTimerCount()).toBe(1);
});
