import * as fc from "fast-check";
import { expect, test, vi } from "vitest";

import { noReview } from "../shared/review";
import { reviewChange } from "../test/comments";
import { watchReview } from "../test/review-host";
import {
  added,
  change,
  comment,
  hostWith,
  inTurn,
  keptOn,
  keptReview,
  resending,
  settled,
  typed,
} from "../test/review-writes";
import type { Outcome } from "../test/review-writes";
import { reviewsKept } from "./reviews";

const turns = fc.array(
  fc.record(
    {
      writer: fc.constantFrom("a", "b"),
      changes: fc.array(reviewChange, { maxLength: 3 }),
      outcome: fc.constantFrom<Outcome>("kept", "refused", "lost"),
      restarts: fc.boolean(),
    },
    { noNullPrototype: true },
  ),
  { maxLength: 8 },
);

test("each write's changes are made once, in the order the host first kept the writes in, though a write is sent again, as where the host refused it or its answer was lost, and the server starts again", async () => {
  await fc.assert(
    fc.asyncProperty(turns, async (taken) => {
      const host = hostWith();
      const views = resending(host, reviewsKept);

      await inTurn(taken, views.take);
      await views.finish();

      const { review, taken: made } = views.expected();

      expect(keptReview(host)).toStrictEqual(review);
      expect(new Map(keptOn(host)?.taken)).toStrictEqual(made);
    }),
  );
});

test("a write the workspace keeps isn't made again, as one sent again where the answer was lost, nor is one before it, though the server started again since", async () => {
  const host = hostWith();

  await change(reviewsKept(), host, { writer: "a", write: 1, changes: [added] });
  await change(reviewsKept(), host, {
    writer: "b",
    write: 1,
    changes: [{ kind: "delete", id: 2 }],
  });

  const reviews = reviewsKept();

  await change(reviews, host, { writer: "a", write: 1, changes: [added] });

  expect(keptReview(host)).toStrictEqual(noReview);

  await change(reviews, host, { writer: "a", write: 3, changes: [typed("Fix.")] });
  await change(reviews, host, { writer: "a", write: 2, changes: [added] });

  expect(keptOn(host)).toStrictEqual({
    review: { comments: [], message: "Fix." },
    taken: [
      ["b", 1],
      ["a", 3],
    ],
  });
});

test("a change answers once the workspace keeps it, and fails where it can't be kept, without the views being told of it; sent again, it's kept, and they're told", async () => {
  const host = hostWith();
  const reviews = reviewsKept();
  const view = watchReview(reviews, host, "w", "a");
  const write = { writer: "a", write: 1, changes: [added] };

  host.fail(true);

  await expect(change(reviews, host, write)).rejects.toThrow("The host can't keep it.");
  expect(view.told.map((told) => told.review)).toStrictEqual([noReview]);
  expect(keptOn(host)).toBeUndefined();

  host.fail(false);
  await change(reviews, host, write);

  expect(view.last()).toStrictEqual({ taken: 1, review: { comments: [comment], message: "" } });
  expect(keptReview(host)).toStrictEqual({ comments: [comment], message: "" });
  await view.leave();
});

test("a write the host kept, though its answer was lost, is told to the views once the server reads the review again, and isn't made again when it's sent again, after another view's write", async () => {
  const host = hostWith();
  const reviews = reviewsKept();
  const view = watchReview(reviews, host, "w", "a");
  const write = { writer: "a", write: 1, changes: [typed("From a.")] };

  host.lose(true);

  await expect(change(reviews, host, write)).rejects.toThrow("The host's answer is lost.");
  expect(view.told.map(({ taken }) => taken)).toStrictEqual([0]);

  host.lose(false);
  await change(reviews, host, { writer: "b", write: 1, changes: [typed("From b.")] });

  expect(view.told).toStrictEqual([
    { taken: 0, review: noReview },
    { taken: 1, review: { comments: [], message: "From a." } },
    { taken: 1, review: { comments: [], message: "From b." } },
  ]);

  await change(reviews, host, write);

  expect(keptReview(host)).toStrictEqual({ comments: [], message: "From b." });
  expect(view.told).toHaveLength(3);
  await view.leave();
});

test("the server has the workspace keep one write at a time, and a write that fails doesn't fail the one waiting for it", async () => {
  const host = hostWith();
  const reviews = reviewsKept();

  host.hold(true);
  host.fail(true);

  const first = change(reviews, host, { writer: "a", write: 1, changes: [added] });

  await vi.waitFor(() => {
    expect(host.writes()).toBe(1);
  });
  host.fail(false);

  const second = change(reviews, host, { writer: "b", write: 1, changes: [typed("Fix.")] });

  await settled();

  expect(host.writes()).toBe(1);

  host.release();

  await expect(first).rejects.toThrow("The host can't keep it.");
  await vi.waitFor(() => {
    expect(host.writes()).toBe(2);
  });
  expect(keptOn(host)).toBeUndefined();

  host.release();
  await second;

  expect(keptOn(host)).toStrictEqual({
    review: { comments: [], message: "Fix." },
    taken: [["b", 1]],
  });
});

test("a workspace keeps the numbers of the last writes of the sixteen views that wrote last, the latest last, and makes a write of a view before them again", async () => {
  const host = hostWith();
  const reviews = reviewsKept();
  const writers = Array.from({ length: 17 }, (_, at) => `view ${at}`);

  await inTurn(writers.slice(0, 16), async (writer) => {
    await change(reviews, host, { writer, write: 1, changes: [typed(writer)] });
  });

  expect(keptOn(host)?.taken).toStrictEqual(writers.slice(0, 16).map((writer) => [writer, 1]));

  await change(reviews, host, { writer: "view 0", write: 2, changes: [typed("Again.")] });

  expect(keptOn(host)?.taken).toStrictEqual([
    ...writers.slice(1, 16).map((writer) => [writer, 1]),
    ["view 0", 2],
  ]);

  await change(reviews, host, { writer: "view 16", write: 1, changes: [typed("view 16")] });

  expect(keptOn(host)?.taken).toStrictEqual([
    ...writers.slice(2, 16).map((writer) => [writer, 1]),
    ["view 0", 2],
    ["view 16", 1],
  ]);

  await change(reviews, host, { writer: "view 1", write: 1, changes: [typed("view 1")] });

  expect(keptReview(host).message).toBe("view 1");
});
