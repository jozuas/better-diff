import * as fc from "fast-check";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { confirmation } from "./confirmation";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// A confirmation, with each button it said was armed, or undefined for none, each action it ran,
// and how many of those are running. Each runs until it's ended.
function confirmations() {
  const heard: (string | undefined)[] = [];
  const ran: string[] = [];
  const ends: ((fails: boolean) => void)[] = [];

  const confirm = confirmation((button) => {
    heard.push(button);
  });

  return {
    heard,
    ran,
    running: () => ends.length,
    press: (button: string, confirms: boolean) => {
      confirm.press(button, confirms, async () => {
        ran.push(button);
        await new Promise<void>((resolve, reject) => {
          ends.push((fails) => {
            if (fails) {
              reject(new Error(`${button} failed`));
            } else {
              resolve();
            }
          });
        });
      });
    },
    // Ends the actions running, as they succeed or fail, once the confirmation hears they have.
    end: async (fails: boolean) => {
      for (const end of ends.splice(0)) {
        end(fails);
      }

      await vi.advanceTimersByTimeAsync(0);
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

type Step =
  | { kind: "press"; button: string; confirms: boolean }
  | { kind: "end"; fails: boolean }
  | { kind: "wait"; milliseconds: number };

const step: fc.Arbitrary<Step> = fc.oneof(
  // Few buttons, so the same one is often pressed again, as confirming it does.
  fc.record({
    kind: fc.constant("press"),
    button: fc.constantFrom("discard", "stage"),
    confirms: fc.boolean(),
  }),
  fc.record({ kind: fc.constant("end"), fails: fc.boolean() }),
  fc.record({ kind: fc.constant("wait"), milliseconds: fc.constantFrom(1000, 3000) }),
);

type Confirmations = ReturnType<typeof confirmations>;

// What the presses did: the most actions running at once, the presses that ran an action, or armed
// or disarmed a button, while one was running, and those that needed no confirmation and didn't
// run theirs while none was.
interface Taken {
  most: number;
  whileRunning: Step[];
  notRun: Step[];
}

// Takes the step on the confirmation, after the steps before it, which did what `taken` says.
async function takeOne(confirm: Confirmations, next: Step, taken: Taken): Promise<Taken> {
  if (next.kind === "end") {
    await confirm.end(next.fails);

    return taken;
  }

  if (next.kind === "wait") {
    vi.advanceTimersByTime(next.milliseconds);

    return taken;
  }

  const running = confirm.running() > 0;
  const before = { heard: confirm.heard.length, ran: confirm.ran.length };

  confirm.press(next.button, next.confirms);

  const ran = confirm.ran.length > before.ran;
  const heard = confirm.heard.length > before.heard;

  return {
    most: Math.max(taken.most, confirm.running()),
    whileRunning: running && (ran || heard) ? [...taken.whileRunning, next] : taken.whileRunning,
    notRun: !running && !next.confirms && !ran ? [...taken.notRun, next] : taken.notRun,
  };
}

// Takes each step on the confirmation in turn, once the one before is taken.
async function take(confirm: Confirmations, steps: readonly Step[], taken: Taken): Promise<Taken> {
  const [next, ...rest] = steps;

  if (next === undefined) {
    return taken;
  }

  const after = await take(confirm, rest, await takeOne(confirm, next, taken));

  return after;
}

test("runs one action at a time: a press while one is running does nothing, until it succeeds or fails", async () => {
  await fc.assert(
    fc.asyncProperty(fc.array(step, { maxLength: 20 }), async (steps) => {
      const confirm = confirmations();

      const { most, whileRunning, notRun } = await take(confirm, steps, {
        most: 0,
        whileRunning: [],
        notRun: [],
      });

      confirm.dispose();

      expect(most).toBeLessThanOrEqual(1);
      expect({ whileRunning, notRun }).toStrictEqual({ whileRunning: [], notRun: [] });
    }),
    {
      examples: [
        [
          [
            { kind: "press", button: "stage", confirms: false },
            { kind: "press", button: "discard", confirms: true },
            { kind: "press", button: "discard", confirms: true },
            { kind: "press", button: "stage", confirms: false },
            { kind: "end", fails: false },
            { kind: "press", button: "stage", confirms: false },
          ],
        ],
        [
          [
            { kind: "press", button: "stage", confirms: false },
            { kind: "end", fails: true },
            { kind: "press", button: "stage", confirms: false },
          ],
        ],
      ],
    },
  );
});
