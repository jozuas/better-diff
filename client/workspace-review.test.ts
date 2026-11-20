import type { SubscriptionEvent } from "@getpaseo/plugin";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { noReview } from "../shared/review";
import type { Review, ReviewChange, ReviewComment, reviewWatchRpc } from "../shared/review";
import { badgeLabel, reviewingThrough } from "./workspace-review";

type Told = SubscriptionEvent<typeof reviewWatchRpc>;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const comment: ReviewComment = { path: "a.txt", side: "new", line: 3, id: 2, body: "Why?" };

const added: ReviewChange = { kind: "add", comment };

function typed(text: string): ReviewChange {
  return { kind: "message", text };
}

interface Answer {
  resolve: () => void;
  reject: (error: Error) => void;
}

// A view whose writes are each answered as the test says, what it sent, and what it said of those
// that couldn't be kept.
function viewOf() {
  const answers: Answer[] = [];
  const sent: { write: number; changes: ReviewChange[] }[] = [];
  const failed = vi.fn<() => void>();

  const review = reviewingThrough("w", {
    current: {
      change: async ({ write, changes }) => {
        sent.push({ write, changes });

        await new Promise<void>((resolve, reject) => {
          answers.push({ resolve, reject });
        });

        return {};
      },
      failed,
    },
  });

  return {
    review,
    sent,
    failed,
    // Answers the last write sent: kept, or not.
    keep: async () => {
      answers.at(-1)?.resolve();
      await vi.advanceTimersByTimeAsync(0);
    },
    fail: async () => {
      answers.at(-1)?.reject(new Error("The host can't be reached."));
      await vi.advanceTimersByTimeAsync(0);
    },
  };
}

function told(review: Review, taken = 0): Told {
  return { taken, review };
}

// Makes the changes, and records once they're kept.
function changing(
  review: ReturnType<typeof viewOf>["review"],
  kept: string[],
  name: string,
  ...changes: ReviewChange[]
): void {
  async function change(): Promise<void> {
    await review.change(...changes);
    kept.push(name);
  }

  void change();
}

test("a view shows its changes at once, over the review the server tells of", () => {
  const { review } = viewOf();

  void review.change(added);
  review.told(told({ comments: [], message: "Fix." }));

  expect(review.value()).toStrictEqual({ comments: [comment], message: "Fix." });
});

test("a view shows its changes over the review the server tells of, though kept, until the server tells that the workspace keeps them", async () => {
  const { review, keep } = viewOf();

  void review.change(added);
  await keep();
  review.told(told({ comments: [], message: "Fix." }));

  expect(review.value().comments).toStrictEqual([comment]);

  review.told(told(noReview, 1));

  expect(review.value()).toStrictEqual(noReview);
});

test("changes made while a write is under way are sent together in the next, once it's kept, and each is kept once its write is", async () => {
  const { review, sent, keep } = viewOf();
  const kept: string[] = [];

  changing(review, kept, "F", typed("F"));
  changing(review, kept, "added", added);
  changing(review, kept, "Fix", typed("Fix"));

  await keep();

  expect(kept).toStrictEqual(["F"]);
  expect(sent).toStrictEqual([
    { write: 1, changes: [typed("F")] },
    { write: 2, changes: [added, typed("Fix")] },
  ]);

  await keep();

  expect(kept).toStrictEqual(["F", "added", "Fix"]);
});

test("the message typed takes the place of that typed before it that isn't sent yet, though other changes are made with it", async () => {
  const { review, sent, keep } = viewOf();

  void review.change(typed("F"));
  void review.change(typed("Fi"));
  void review.change(added, typed("Fix"));

  expect(review.value().message).toBe("Fix");

  await keep();

  expect(sent.at(-1)).toStrictEqual({ write: 2, changes: [added, typed("Fix")] });
});

test("a message typed stays to be sent after other changes made since, and a message changed from what it said doesn't take its place", async () => {
  const { review, sent, keep } = viewOf();
  const emptied: ReviewChange = { kind: "message", text: "", said: "Fi" };

  void review.change(typed("F"));
  void review.change(typed("Fi"));
  void review.change(added);
  void review.change(emptied);

  expect(review.value().message).toBe("");

  await keep();

  expect(sent.at(-1)).toStrictEqual({ write: 2, changes: [typed("Fi"), added, emptied] });
});

test("a change made while a write is under way says so where its own write can't be kept", async () => {
  const { review, failed, keep, fail } = viewOf();

  void review.change(added);
  void review.change(typed("Fix."));
  await keep();
  await fail();

  expect(failed).toHaveBeenCalledTimes(1);
});

test("a write that can't be kept still shows, says so, and is tried again five seconds later", async () => {
  const { review, sent, failed, fail } = viewOf();

  void review.change(added);
  await fail();

  expect(failed).toHaveBeenCalledTimes(1);
  expect(review.value().comments).toStrictEqual([comment]);

  await vi.advanceTimersByTimeAsync(4999);

  expect(sent).toHaveLength(1);

  await vi.advanceTimersByTimeAsync(1);

  expect(sent).toStrictEqual([
    { write: 1, changes: [added] },
    { write: 1, changes: [added] },
  ]);
});

test("a write that can't be kept is tried again every five seconds, without saying so again, until it's kept", async () => {
  const { review, sent, failed, keep, fail } = viewOf();
  const kept: string[] = [];

  changing(review, kept, "added", added);
  await fail();
  await vi.advanceTimersByTimeAsync(5000);
  await fail();
  await vi.advanceTimersByTimeAsync(5000);

  expect(sent).toHaveLength(3);
  expect(failed).toHaveBeenCalledTimes(1);

  await keep();
  await vi.advanceTimersByTimeAsync(10_000);

  expect(kept).toStrictEqual(["added"]);
  expect(sent).toHaveLength(3);
});

test("a change made while a write can't be kept tries it again at once, before the change, and says so again where it fails", async () => {
  const { review, sent, failed, keep, fail } = viewOf();

  void review.change(added);
  await fail();
  void review.change(typed("Fix."));

  expect(sent).toStrictEqual([
    { write: 1, changes: [added] },
    { write: 1, changes: [added] },
  ]);

  await fail();

  expect(failed).toHaveBeenCalledTimes(2);

  await vi.advanceTimersByTimeAsync(5000);
  await keep();

  expect(sent.at(-1)).toStrictEqual({ write: 2, changes: [typed("Fix.")] });
});

test("a write the server didn't answer shows until the server tells that the workspace keeps it, and is sent again, though the workspace keeps it by then", async () => {
  const { review, sent, keep, fail } = viewOf();

  void review.change(added);
  await fail();
  review.told(told(noReview));

  expect(review.value().comments).toStrictEqual([comment]);

  review.told(told({ comments: [], message: "Fix." }, 1));

  expect(review.value()).toStrictEqual({ comments: [], message: "Fix." });

  await vi.advanceTimersByTimeAsync(5000);
  await keep();

  expect(sent).toHaveLength(2);
  expect(review.value()).toStrictEqual({ comments: [], message: "Fix." });
});

test("a view shows only those of its writes after the ones the server tells that the workspace keeps", async () => {
  const { review, keep } = viewOf();

  void review.change(added);
  void review.change({ kind: "message", text: "Fix." });
  await keep();
  review.told(told(noReview, 1));

  expect(review.value()).toStrictEqual({ comments: [], message: "Fix." });
});

test("a change of nothing changes nothing, and sends nothing", () => {
  const { review, sent } = viewOf();
  const before = review.value();

  void review.change();

  expect(sent).toStrictEqual([]);
  expect(review.value()).toBe(before);
});

test("a view's review is the same until it changes, and those that listen hear only that it changed, until they stop", () => {
  const { review } = viewOf();
  const heard = vi.fn<() => void>();
  const stop = review.subscribe(heard);

  review.told(told({ comments: [], message: "Fix." }));

  const read = review.value();

  review.told(told({ comments: [], message: "Fix." }));

  expect(review.value()).toBe(read);
  expect(heard).toHaveBeenCalledTimes(1);

  stop();
  review.told(told({ comments: [comment], message: "Fix." }));

  expect(heard).toHaveBeenCalledTimes(1);
  expect(review.value().comments).toStrictEqual([comment]);
});

test("a view sends its writes for its workspace, and says those that couldn't be kept couldn't, with the latest of what does each", async () => {
  const sending = {
    change: vi.fn<() => Promise<Record<string, never>>>(),
    failed: vi.fn<() => void>(),
  };

  const latest = { current: sending };
  const review = reviewingThrough("w", latest);

  sending.change.mockRejectedValue(new Error("The host can't be reached."));
  latest.current = { ...sending, failed: vi.fn<() => void>() };
  void review.change(added);
  await vi.advanceTimersByTimeAsync(0);

  expect(sending.change).toHaveBeenCalledWith({
    workspace: "w",
    writer: review.writer,
    write: 1,
    changes: [added],
  });
  expect(sending.failed).not.toHaveBeenCalled();
  expect(latest.current.failed).toHaveBeenCalledTimes(1);
});

test("a workspace's row in the sidebar says how many comments are pending", () => {
  expect(badgeLabel(1)).toBe("1 comment");
  expect(badgeLabel(3)).toBe("3 comments");
});

test("each view's writer is its own", () => {
  expect(viewOf().review.writer).not.toBe(viewOf().review.writer);
});
