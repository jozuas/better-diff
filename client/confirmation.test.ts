import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { confirmation } from "./confirmation";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// A confirmation, with each button it said was armed, or undefined for none, and each action it ran.
function confirmations() {
  const heard: (string | undefined)[] = [];
  const ran: string[] = [];

  const confirm = confirmation((button) => {
    heard.push(button);
  });

  return {
    heard,
    ran,
    press: (button: string, confirms: boolean) => {
      confirm.press(button, confirms, () => {
        ran.push(button);
      });
    },
    dispose: confirm.dispose,
  };
}

test("runs an action that needs no confirmation at once", () => {
  const { heard, ran, press } = confirmations();

  press("stage", false);

  expect(ran).toStrictEqual(["stage"]);
  expect(heard).toStrictEqual([undefined]);
});

test("arms a button whose action needs confirmation on its first press, and runs it on the second", () => {
  const { heard, ran, press } = confirmations();

  press("discard", true);

  expect(ran).toStrictEqual([]);

  press("discard", true);
  vi.advanceTimersByTime(3000);

  expect(ran).toStrictEqual(["discard"]);
  expect(heard).toStrictEqual(["discard", undefined]);
});

test("disarms a button three seconds after its first press, so the next press arms it again", () => {
  const { heard, ran, press } = confirmations();

  press("discard", true);
  vi.advanceTimersByTime(2999);

  expect(heard).toStrictEqual(["discard"]);

  vi.advanceTimersByTime(1);
  press("discard", true);
  vi.advanceTimersByTime(6000);

  expect(heard).toStrictEqual(["discard", undefined, "discard", undefined]);
  expect(ran).toStrictEqual([]);
});

test("arms only the last button pressed, for three seconds from its own press", () => {
  const { heard, ran, press } = confirmations();

  press("discard file", true);
  vi.advanceTimersByTime(2000);
  press("discard hunk", true);
  vi.advanceTimersByTime(2999);
  press("discard file", true);

  expect(heard).toStrictEqual(["discard file", "discard hunk", "discard file"]);
  expect(ran).toStrictEqual([]);
});

test("disarms the armed button when another one runs its action", () => {
  const { heard, ran, press } = confirmations();

  press("discard", true);
  press("stage", false);
  vi.advanceTimersByTime(3000);

  expect(heard).toStrictEqual(["discard", undefined]);
  expect(ran).toStrictEqual(["stage"]);
});

test("leaves a button armed once disposed of, since nothing hears of it any more", () => {
  const { heard, press, dispose } = confirmations();

  press("discard", true);
  dispose();
  vi.advanceTimersByTime(3000);

  expect(heard).toStrictEqual(["discard"]);
});
