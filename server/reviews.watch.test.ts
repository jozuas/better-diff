import type { SubscriptionEvent } from "@getpaseo/plugin";
import { expect, test, vi } from "vitest";

import type { reviewWatchRpc } from "../shared/review";
import { watchReview } from "../test/review-host";
import { added, change, comment, hostWith, keptReview, settled } from "../test/review-writes";
import { reviewsKept } from "./reviews";

type Told = SubscriptionEvent<typeof reviewWatchRpc>;

test("a view that leaves is told nothing more, and one that leaves before the review is read, nothing", async () => {
  const host = hostWith();
  const reviews = reviewsKept();
  const view = watchReview(reviews, host, "w");
  const early = watchReview(reviews, host, "w");

  await early.leave();
  await vi.waitFor(() => {
    expect(view.told).toHaveLength(1);
  });
  await view.leave();
  await change(reviews, host, { writer: "a", write: 1, changes: [added] });

  expect(view.told).toHaveLength(1);
  expect(early.told).toStrictEqual([]);
});

test("a view that had left before the server heard of it has nothing read for it", async () => {
  const host = hostWith();
  const left = new AbortController();
  const push = vi.fn<() => Promise<void>>();

  left.abort();

  const watched = reviewsKept().watch(
    { workspace: "w" },
    { paseo: host.paseo, push, signal: left.signal },
  );

  await settled();

  expect(host.reads()).toBe(0);
  expect(push).not.toHaveBeenCalled();
  await watched;
});

test("a view that leaves while it's first told of the review is told nothing more", async () => {
  const host = hostWith();
  const reviews = reviewsKept();
  const leaving = new AbortController();
  const told: Told[] = [];

  const watched = reviews.watch(
    { workspace: "w" },
    {
      paseo: host.paseo,
      push: async (event) => {
        told.push(event);
        leaving.abort();
        await Promise.resolve();
      },
      signal: leaving.signal,
    },
  );

  await watched;
  await change(reviews, host, { writer: "a", write: 1, changes: [added] });

  expect(told).toHaveLength(1);
});

test("a view the server can no longer tell doesn't keep a change from being made", async () => {
  const host = hostWith();
  const reviews = reviewsKept();
  const leaving = new AbortController();

  const watched = reviews.watch(
    { workspace: "w" },
    {
      paseo: host.paseo,
      push: async () => {
        await Promise.reject(new Error("The plugin is cut off from Paseo."));
      },
      signal: leaving.signal,
    },
  );

  await change(reviews, host, { writer: "a", write: 1, changes: [added] });

  expect(keptReview(host)).toStrictEqual({ comments: [comment], message: "" });
  leaving.abort();
  await watched;
});
