import * as fc from "fast-check";
import { expect, test, vi } from "vitest";

import { changedBy, noReview } from "../shared/review";
import { reviewChange } from "../test/comments";
import { reviewHost, watchReview } from "../test/review-host";
import {
  added,
  change,
  comment,
  hostWith,
  keptReview,
  reviewKey,
  typed,
} from "../test/review-writes";
import { reviewsKept } from "./reviews";

// Two views' writes, in the order they reach the server, each view's numbered in turn.
const writes = fc
  .array(fc.tuple(fc.constantFrom("a", "b"), fc.array(reviewChange, { maxLength: 3 })), {
    maxLength: 6,
  })
  .map((sent) => {
    const numbers = new Map<string, number>();

    return sent.map(([writer, changes]) => {
      const write = (numbers.get(writer) ?? 0) + 1;

      numbers.set(writer, write);

      return { writer, write, changes };
    });
  });

test("the server makes the changes of the writes that reach it, in the order they reach it, whichever view they're from, tells its views, and the workspace keeps the review", async () => {
  await fc.assert(
    fc.asyncProperty(writes, async (sent) => {
      const host = hostWith();
      const reviews = reviewsKept();
      const view = watchReview(reviews, host, "w");

      const expected = changedBy(
        noReview,
        sent.flatMap(({ changes }) => changes),
      );

      await Promise.all(
        sent.map(async (write) => {
          await change(reviews, host, write);
        }),
      );

      await vi.waitFor(() => {
        expect(view.last()?.review).toStrictEqual(expected);
      });
      expect(keptReview(host)).toStrictEqual(expected);
      await view.leave();
    }),
  );
});

test("a view is told how many of its own writes the workspace keeps, and a view that only reads, none", async () => {
  const host = hostWith();
  const reviews = reviewsKept();
  const own = watchReview(reviews, host, "w", "a");
  const reader = watchReview(reviews, host, "w");

  await change(reviews, host, { writer: "a", write: 1, changes: [added] });
  await change(reviews, host, { writer: "b", write: 4, changes: [typed("Fix.")] });

  expect(own.told.map(({ taken }) => taken)).toStrictEqual([0, 1, 1]);
  expect(reader.told.map(({ taken }) => taken)).toStrictEqual([0, 0, 0]);
  expect(own.last()?.review).toStrictEqual({ comments: [comment], message: "Fix." });
  await own.leave();
  await reader.leave();
});

test("once the server starts again, it reads the review the workspace keeps, and tells a view how many of its writes are made in it", async () => {
  const host = hostWith();

  await change(reviewsKept(), host, { writer: "a", write: 2, changes: [added, typed("Fix.")] });

  const next = watchReview(reviewsKept(), host, "w", "a");

  await vi.waitFor(() => {
    expect(next.told).toStrictEqual([
      { taken: 2, review: { comments: [comment], message: "Fix." } },
    ]);
  });
  await next.leave();
});

test("a review the workspace keeps that the server can't read is read as none, other plugins' keys stay as they are, and a review with nothing left is kept, with the writes made in it", async () => {
  const host = reviewHost();

  host.add("w", { [reviewKey]: { comments: "none" }, other: { kept: true } });

  const view = watchReview(reviewsKept(), host, "w");

  await vi.waitFor(() => {
    expect(view.last()?.review).toStrictEqual(noReview);
  });

  const reviews = reviewsKept();

  await change(reviews, host, { writer: "a", write: 1, changes: [added] });

  expect(host.metadata("w")).toStrictEqual({
    [reviewKey]: { review: { comments: [comment], message: "" }, taken: [["a", 1]] },
    other: { kept: true },
  });

  await change(reviews, host, { writer: "a", write: 2, changes: [{ kind: "delete", id: 2 }] });

  expect(host.metadata("w")).toStrictEqual({
    [reviewKey]: { review: noReview, taken: [["a", 2]] },
    other: { kept: true },
  });
  await view.leave();
});

test("a view of a workspace the host hasn't is told nothing, rather than refused, and a change of it is refused, each reading it again, until the host has it, and the view is told of it once it's read", async () => {
  const host = reviewHost();
  const reviews = reviewsKept();
  const view = watchReview(reviews, host, "w");

  await expect(change(reviews, host, { writer: "a", write: 1, changes: [added] })).rejects.toThrow(
    "Paseo has no workspace w.",
  );
  expect(view.told).toStrictEqual([]);
  expect(host.reads()).toBe(2);

  host.add("w");
  await change(reviews, host, { writer: "b", write: 1, changes: [] });

  expect(view.told).toStrictEqual([
    { taken: 0, review: noReview },
    { taken: 0, review: noReview },
  ]);

  await view.leave();
  await change(reviews, host, { writer: "a", write: 1, changes: [added] });

  expect(view.told).toHaveLength(2);
});

test("the review is read from the workspace once, whatever views and changes need it, until a write fails", async () => {
  const host = hostWith();
  const reviews = reviewsKept();
  const views = [watchReview(reviews, host, "w"), watchReview(reviews, host, "w")];

  await change(reviews, host, { writer: "a", write: 1, changes: [added] });
  await change(reviews, host, { writer: "a", write: 2, changes: [typed("Fix.")] });

  expect(host.reads()).toBe(1);
  expect(views.map((view) => view.last()?.review)).toStrictEqual([
    { comments: [comment], message: "Fix." },
    { comments: [comment], message: "Fix." },
  ]);

  host.fail(true);
  await expect(
    change(reviews, host, { writer: "a", write: 3, changes: [typed("")] }),
  ).rejects.toThrow("The host can't keep it.");
  host.fail(false);
  await change(reviews, host, { writer: "a", write: 3, changes: [typed("")] });

  expect(host.reads()).toBe(2);
  await Promise.all(
    views.map(async (view) => {
      await view.leave();
    }),
  );
});

test("each workspace's review is its own", async () => {
  const host = hostWith();
  const reviews = reviewsKept();

  host.add("other");

  const view = watchReview(reviews, host, "other");

  await change(reviews, host, { writer: "a", write: 1, changes: [added] });

  expect(view.told).toStrictEqual([{ taken: 0, review: noReview }]);
  expect(host.metadata("other")).toStrictEqual({});
  await view.leave();
});
