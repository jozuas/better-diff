import { expect, test } from "vitest";

import { firstSubscribing, restAfter, subscribingAfter } from "./subscribing";

type Heard = Parameters<typeof subscribingAfter>[1];

function after(...heard: Heard[]) {
  let now = firstSubscribing;

  for (const each of heard) {
    now = subscribingAfter(now, each);
  }

  return now;
}

test("a subscription is asked for again each time the server stops telling, and not when it tells of something", () => {
  expect(firstSubscribing.times).toBe(0);
  expect(after("ended").times).toBe(1);
  expect(after("ended", "told", "ended", "ended").times).toBe(3);
  expect(after("ended", "told").times).toBe(1);
});

test("a subscription is asked for again a second after the server stops telling, and twice as long each time it has told of nothing since, up to ten seconds", () => {
  expect(restAfter(firstSubscribing)).toBe(1000);
  expect(restAfter(after("ended"))).toBe(2000);
  expect(restAfter(after("ended", "ended"))).toBe(4000);
  expect(
    [3, 4, 5].map((times) =>
      restAfter(after(...Array.from({ length: times }, (): Heard => "ended"))),
    ),
  ).toStrictEqual([8000, 10_000, 10_000]);
});

test("a subscription is asked for again a second after the server stops telling once it has told of something", () => {
  expect(restAfter(after("ended", "ended", "told"))).toBe(1000);
  expect(restAfter(after("ended", "ended", "told", "ended"))).toBe(2000);
});

test("a subscription is the same once the server tells of something more", () => {
  const told = after("ended", "told");

  expect(subscribingAfter(told, "told")).toBe(told);
  expect(subscribingAfter(firstSubscribing, "told")).toBe(firstSubscribing);
});
