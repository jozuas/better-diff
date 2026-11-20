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

test("tells a subscriber that has left no more, though it left while a check ran", async () => {
  const watched = thing(100);
  const stays = watched.subscribe();
  const leaves = watched.subscribe();

  await pass(50);
  leaves.leave();
  await pass(1000);
  watched.set("2");
  watched.changed();
  await pass(200);

  expect(toldTo(stays)).toStrictEqual([
    ["1", 100],
    ["2", 1200],
  ]);
  expect(toldTo(leaves)).toStrictEqual([]);
});

test("checks no more once the last subscriber has left, though it left while a check ran", async () => {
  const watched = thing(100);
  const subscription = watched.subscribe();

  await pass(50);
  subscription.leave();
  await pass(40_000);

  expect(watched.starts()).toStrictEqual([0]);
});

test("keeps listening for a minute once no subscriber is left, for the next one", async () => {
  const watched = thing(10);
  const subscription = watched.subscribe();

  await pass(30_000);
  subscription.leave();
  await pass(59_999);

  expect([watched.listened(), watched.stopped()]).toStrictEqual([1, 0]);

  await pass(1);

  expect([watched.listened(), watched.stopped()]).toStrictEqual([1, 1]);

  watched.subscribe();
  await pass(10);

  expect([watched.listened(), watched.stopped()]).toStrictEqual([2, 1]);
});

test("keeps listening while a subscriber stays, though a minute has passed since an earlier one left", async () => {
  const watched = thing(10);

  watched.subscribe().leave();
  await pass(30_000);
  watched.subscribe();
  await pass(45_000);

  expect([watched.listened(), watched.stopped()]).toStrictEqual([1, 0]);
});

// Listening that keeps failing, as where the system has no more watches to give, would take the
// watches it could each time.
test("listens anew for a subscriber no sooner than a minute after listening failed", async () => {
  const watched = thing(10, "fails");
  const first = watched.subscribe();

  await pass(10);
  first.leave();

  const second = watched.subscribe();

  await pass(59_989);
  second.leave();

  expect([watched.listened(), watched.stopped()]).toStrictEqual([1, 1]);

  await pass(1);
  watched.subscribe();
  await pass(0);

  expect([watched.listened(), watched.stopped()]).toStrictEqual([2, 2]);
});

test("leaves only the timer of the listening once its subscribers have left", async () => {
  const watched = thing(10);
  const subscription = watched.subscribe();

  await pass(2000);
  subscription.leave();
  await pass(1);

  expect(vi.getTimerCount()).toBe(1);
});

// At 50ms of a check of 100ms, the check is still to tell of the version it finds.
test.each([
  ["resting", 10, 2000, [["1", 10]]],
  ["checking", 100, 50, []],
])(
  "unsubscribing all while %s tells them no more, and leaves no timer or listening behind",
  async (_, took, after, told) => {
    const watched = thing(took);
    const subscription = watched.subscribe();

    await pass(after);
    unsubscribeAll();
    watched.set("2");
    watched.changed();
    await pass(40_000);

    expect(toldTo(subscription)).toStrictEqual(told);
    expect(vi.getTimerCount()).toBe(0);
    expect(watched.stopped()).toBe(1);
    expect(watched.starts().filter((started) => started > after)).toStrictEqual([]);
  },
);

test("unsubscribing all while listening lingers leaves no timer or listening behind", async () => {
  const watched = thing(10);
  const subscription = watched.subscribe();

  await pass(2000);
  subscription.leave();
  await pass(1);
  unsubscribeAll();
  await pass(0);

  expect(vi.getTimerCount()).toBe(0);
  expect(watched.stopped()).toBe(1);
});

test("unsubscribing all before the first check checks nothing, and listens to nothing", async () => {
  const watched = thing(10);
  const subscription = watched.subscribe();

  unsubscribeAll();
  await pass(10);

  expect(toldTo(subscription)).toStrictEqual([]);
  expect([watched.listened(), watched.starts()]).toStrictEqual([0, []]);
  expect(vi.getTimerCount()).toBe(0);
});

test("unsubscribing all stops listening that's starting once it has started", async () => {
  const watched = thing(10, "tells", 2500);

  watched.subscribe();
  await pass(100);
  unsubscribeAll();
  await pass(2500);

  expect([watched.listened(), watched.stopped()]).toStrictEqual([1, 1]);
});

test("a subscriber that comes after all were unsubscribed is told, and listens anew", async () => {
  const watched = thing(10);

  watched.subscribe();
  await pass(2000);
  unsubscribeAll();

  const subscription = watched.subscribe();

  await pass(10);

  expect(toldTo(subscription)).toStrictEqual([["1", 2010]]);
  expect([watched.listened(), watched.stopped()]).toStrictEqual([2, 1]);
});
