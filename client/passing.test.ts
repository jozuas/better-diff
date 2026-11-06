import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { OpenFile, OpenFiles } from "./groups";
import { passing } from "./passing";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const a = { group: "modified", path: "a" } as const;
const b = { group: "modified", path: "b" } as const;
const c = { group: "staged", path: "c" } as const;

// How long after the last file passed it opens.
const pause = 200;

function opening() {
  const opened: (OpenFile | OpenFiles)[] = [];

  return {
    opened,
    passes: passing((open) => {
      opened.push(open);
    }, pause),
  };
}

test("opens what's given at once", () => {
  const { opened, passes } = opening();

  passes.open(a);

  expect(opened).toStrictEqual([a]);
});

test("opens only the last file passed, once keys stop passing files for a while", () => {
  const { opened, passes } = opening();

  passes.pass(a);
  vi.advanceTimersByTime(pause - 1);
  passes.pass(b);
  vi.advanceTimersByTime(pause - 1);

  expect(opened).toStrictEqual([]);

  vi.advanceTimersByTime(1);

  expect(opened).toStrictEqual([b]);

  vi.runAllTimers();

  expect(opened).toStrictEqual([b]);
});

test("opens the last file passed at once once flushed, and only once", () => {
  const { opened, passes } = opening();

  passes.pass(a);
  passes.flush();
  passes.flush();
  vi.runAllTimers();

  expect(opened).toStrictEqual([a]);
});

test("opening a file at once no longer opens the one passed", () => {
  const { opened, passes } = opening();

  passes.pass(a);
  passes.open(c);
  passes.flush();
  vi.runAllTimers();

  expect(opened).toStrictEqual([c]);
});

test("once disposed, opens no file passed", () => {
  const { opened, passes } = opening();

  passes.pass(a);
  passes.dispose();
  passes.flush();
  vi.runAllTimers();

  expect(opened).toStrictEqual([]);
});
