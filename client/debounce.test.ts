import * as fc from "fast-check";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { debounced } from "./debounce";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const pause = 500;

type Step =
  | { kind: "set"; value: number | undefined }
  | { kind: "wait"; milliseconds: number }
  | { kind: "flush" };

const step: fc.Arbitrary<Step> = fc.oneof(
  // Few values, so the same one is often set again.
  fc.record({
    kind: fc.constant("set"),
    value: fc.option(fc.integer({ min: 0, max: 2 }), { nil: undefined }),
  }),
  fc.record({
    kind: fc.constant("wait"),
    milliseconds: fc.oneof(fc.integer({ min: 0, max: 1000 }), fc.constantFrom(499, 500, 501)),
  }),
  fc.record({ kind: fc.constant("flush") }),
);

// The value of each action run, and how many milliseconds in.
type Run = [value: number, at: number];

// What a debounce runs: the action of each value set, unless another is set first, pause
// milliseconds after it's set, or when flushed before then.
function model(steps: readonly Step[]): Run[] {
  const runs: Run[] = [];
  let now = 0;
  let waiting: { value: number; since: number } | undefined;

  for (const next of steps) {
    if (next.kind === "set") {
      waiting = next.value === undefined ? undefined : { value: next.value, since: now };
    } else if (next.kind === "flush") {
      if (waiting !== undefined) {
        runs.push([waiting.value, now]);
      }

      waiting = undefined;
    } else {
      if (waiting !== undefined && waiting.since + pause <= now + next.milliseconds) {
        runs.push([waiting.value, waiting.since + pause]);
        waiting = undefined;
      }

      now += next.milliseconds;
    }
  }

  return runs;
}

// What a debounce runs, given an action for each value, the same one each time the value is
// set.
function runsOf(steps: readonly Step[]): Run[] {
  const runs: Run[] = [];
  const start = Date.now();
  const actions = new Map<number, () => void>();
  const debounce = debounced(pause);

  function actionOf(value: number): () => void {
    const action =
      actions.get(value) ??
      (() => {
        runs.push([value, Date.now() - start]);
      });

    actions.set(value, action);

    return action;
  }

  for (const next of steps) {
    if (next.kind === "set") {
      debounce.set(next.value === undefined ? undefined : actionOf(next.value));
    } else if (next.kind === "flush") {
      debounce.flush();
    } else {
      vi.advanceTimersByTime(next.milliseconds);
    }
  }

  return runs;
}

test("runs the action set, unless another is set first, once the pause after it is over, or when flushed before then", () => {
  fc.assert(
    fc.property(fc.array(step, { maxLength: 20 }), (steps) => {
      expect(runsOf(steps)).toStrictEqual(model(steps));
    }),
    {
      examples: [
        [
          [
            { kind: "set", value: 1 },
            { kind: "wait", milliseconds: 400 },
            { kind: "set", value: 1 },
            { kind: "wait", milliseconds: 400 },
            { kind: "wait", milliseconds: 100 },
          ],
        ],
        [
          [
            { kind: "set", value: 1 },
            { kind: "set", value: undefined },
            { kind: "wait", milliseconds: 500 },
            { kind: "flush" },
          ],
        ],
        [
          [
            { kind: "set", value: 1 },
            { kind: "flush" },
            { kind: "wait", milliseconds: 500 },
            { kind: "flush" },
          ],
        ],
      ],
    },
  );
});
