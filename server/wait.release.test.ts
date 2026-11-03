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

test("releasing answers the waits from the version at once, with it, and leaves the others waiting", async () => {
  const watched = thing(10);
  const kept = watched.wait("1");
  const released = watched.wait("2");

  watched.release("2");
  await pass(1000);

  expect(answered(released)).toStrictEqual({ version: "2", at: 0, failed: false });
  expect(kept.at).toBeUndefined();
});

test("releasing the last wait stops the checks at once, and listening a minute after", async () => {
  const watched = thing(10);

  watched.wait("1");
  await pass(2000);
  watched.release("1");
  await pass(60_000);

  expect(watched.starts()).toStrictEqual([0, 1010]);
  expect(watched.stopped()).toBe(1);
});

test("releasing waits for what no one waits for does nothing", async () => {
  const watched = thing(10);

  watched.release("1");
  await pass(1000);

  expect([watched.listened(), watched.starts()]).toStrictEqual([0, []]);
});
