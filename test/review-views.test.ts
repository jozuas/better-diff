import type { SubscriptionEvent } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test, vi } from "vitest";
import { z } from "zod";

import { discarded, saved } from "../client/comments";
import { reviewingThrough } from "../client/workspace-review";
import type { Reviewing } from "../client/workspace-review";
import { reviewsKept } from "../server/reviews";
import {
  noReview,
  reviewChangeRpc,
  review as reviewSchema,
  reviewWatchRpc,
} from "../shared/review";
import type { CommentTarget, Review, ReviewChange } from "../shared/review";
import { commentBody, commentTarget } from "./comments";
import { reviewHost, watchReview } from "./review-host";

type Told = SubscriptionEvent<typeof reviewWatchRpc>;

// What a view does to the review, as it shows it then.
type Action =
  | { kind: "add"; target: CommentTarget; body: string; pick: number }
  | { kind: "edit"; at: number; body: string }
  | { kind: "delete"; at: number }
  | { kind: "type"; text: string }
  | { kind: "discard" };

const body = commentBody.map((text) => `[${text}]`);

const pick = fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true });

const adding = fc.record(
  { kind: fc.constant("add" as const), target: commentTarget, body, pick },
  { noNullPrototype: true },
);

const action: fc.Arbitrary<Action> = fc.oneof(
  { weight: 3, arbitrary: adding },
  fc.record({ kind: fc.constant("edit" as const), at: fc.nat(), body }, { noNullPrototype: true }),
  fc.record({ kind: fc.constant("delete" as const), at: fc.nat() }, { noNullPrototype: true }),
  fc.record({ kind: fc.constant("type" as const), text: commentBody }, { noNullPrototype: true }),
  fc.constant({ kind: "discard" as const }),
);

// The changes the action makes of the review as the view shows it.
function changesOf(review: Reviewing, done: Action): ReviewChange[] {
  const { comments } = review.value();

  if (done.kind === "add") {
    const made = saved(
      comments,
      { target: done.target, id: undefined },
      done.body,
      () => done.pick,
    );

    return made === undefined ? [] : [made];
  }

  if (done.kind === "type") {
    return [{ kind: "message", text: done.text }];
  }

  if (done.kind === "discard") {
    return discarded(comments);
  }

  const picked = comments[done.at % Math.max(1, comments.length)];

  if (picked === undefined) {
    return [];
  }

  if (done.kind === "delete") {
    return [{ kind: "delete", id: picked.id }];
  }

  const made = saved(comments, { target: picked, id: picked.id, said: picked.body }, done.body);

  return made === undefined ? [] : [made];
}

// The ids of the comments the changes make.
function madeBy(changes: readonly ReviewChange[]): number[] {
  return changes.flatMap((change) => (change.kind === "add" ? [change.comment.id] : []));
}

// The comments each view made, and those of them a view didn't show after it made them.
function madeComments() {
  const made = new Map<View, number[]>();
  const missing: number[] = [];

  return {
    missing,
    made: (view: View, changes: readonly ReviewChange[]) => {
      made.set(view, [...(made.get(view) ?? []), ...madeBy(changes)]);
    },
    shown: (view: View) => {
      const shown = new Set(view.review.value().comments.map(({ id }) => id));

      missing.push(...(made.get(view) ?? []).filter((id) => !shown.has(id)));
    },
  };
}

// A view of a workspace's review, on a client of the host, with what it does to the review.
interface View {
  review: Reviewing;
  actions: Action[];
}

// Views of a workspace's review, each on a client of the host, doing what each is given to, with
// the plugin's server, where the scheduler has each write reach the server, its answer reach the
// view, and what the server tells a view reach it, in the order it was told, in whatever order it
// picks. Each reads what crosses to the other as Paseo does, by the contracts.
function clients(scheduler: fc.Scheduler, acts: readonly Action[][]) {
  const host = reviewHost();
  const reviews = reviewsKept();
  const leaving = new AbortController();
  const failures: string[] = [];
  const watching: Promise<void>[] = [];
  const firsts: Promise<void>[] = [];

  host.add("w");

  const views = acts.map((actions): View => {
    const queue: Told[] = [];
    const heard: (() => void)[] = [];

    firsts.push(
      new Promise<void>((resolve) => {
        heard.push(resolve);
      }),
    );

    const review = reviewingThrough("w", {
      current: {
        change: async (write) => {
          await scheduler.schedule(Promise.resolve(), "reaches the server");

          const answer = await reviews.change(reviewChangeRpc.input.parse(write), {
            paseo: host.paseo,
          });

          await scheduler.schedule(Promise.resolve(), "answered");

          return reviewChangeRpc.output.parse(answer);
        },
        failed: () => {
          failures.push("failed");
        },
      },
    });

    async function deliver(): Promise<void> {
      await scheduler.schedule(Promise.resolve(), "told");

      const next = queue.shift();

      if (next !== undefined) {
        review.told(next);
      }
    }

    watching.push(
      reviews.watch(reviewWatchRpc.input.parse({ workspace: "w", writer: review.writer }), {
        paseo: host.paseo,
        push: async (event) => {
          queue.push(reviewWatchRpc.event.parse(event));

          for (const resolve of heard.splice(0)) {
            resolve();
          }

          void deliver();
          await Promise.resolve();
        },
        signal: leaving.signal,
      }),
    );

    return { review, actions };
  });

  return {
    views,
    failures,
    // Once the server has first told each view of the review.
    told: async () => {
      await Promise.all(firsts);
    },
    kept: (): Review =>
      z
        .object({ review: reviewSchema })
        .default({ review: noReview })
        .parse(host.metadata("w")?.["better-diff.review"]).review,
    leave: async () => {
      leaving.abort();
      await Promise.all(watching);
    },
  };
}

// Has each view do what it's given to, each when the scheduler picks, and make the changes that
// makes, with what hears each view's changes, and resolves once every view's changes are kept and
// the server has told every view of them.
async function act(
  scheduler: fc.Scheduler,
  views: readonly View[],
  heard: (view: View, changes: readonly ReviewChange[]) => void = () => {},
): Promise<void> {
  const changing = views.flatMap((view) =>
    view.actions.map(async (done) => {
      await scheduler.schedule(Promise.resolve(), "acts");

      const changes = changesOf(view.review, done);

      heard(view, changes);
      await view.review.change(...changes);
    }),
  );

  await scheduler.waitFor(Promise.all(changing));
  await scheduler.waitIdle();
}

test("each view's changes are kept, and once the server has told every view of them, every view shows the review the workspace keeps, whatever order the writes, answers and what the server tells reach them in", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.scheduler(),
      fc.array(fc.array(action, { maxLength: 4 }), { minLength: 1, maxLength: 3 }),
      async (scheduler, acts) => {
        const { views, failures, told, kept, leave } = clients(scheduler, acts);

        await told();
        await act(scheduler, views);

        const expected = kept();

        expect(views.map(({ review }) => review.value())).toStrictEqual(views.map(() => expected));
        expect(failures).toStrictEqual([]);
        await leave();
      },
    ),
  );
});

test("a comment a view made shows there from then on, whatever order the writes, answers and what the server tells reach the views in, while no view deletes it", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.scheduler(),
      fc.array(fc.array(adding, { maxLength: 3 }), { minLength: 1, maxLength: 3 }),
      async (scheduler, acts) => {
        const { views, told, leave } = clients(scheduler, acts);
        const made = madeComments();

        for (const view of views) {
          view.review.subscribe(() => {
            made.shown(view);
          });
        }

        await told();
        await act(scheduler, views, made.made);

        expect(made.missing).toStrictEqual([]);
        await leave();
      },
    ),
  );
});

test("once the plugin's server starts again, a view shows what it tells of then, rather than its own changes the workspace kept before, as one another view deleted since", async () => {
  const host = reviewHost();
  const first = reviewsKept();
  const comment = { path: "a.txt", side: "new", line: 3, id: 2, body: "Why?" } as const;

  host.add("w");

  const review = reviewingThrough("w", {
    current: {
      change: async (write) => {
        const answer = await first.change(reviewChangeRpc.input.parse(write), {
          paseo: host.paseo,
        });

        return reviewChangeRpc.output.parse(answer);
      },
      failed: () => {},
    },
  });

  await review.change({ kind: "add", comment });

  const next = reviewsKept();

  await next.change(
    { workspace: "w", writer: "other", write: 1, changes: [{ kind: "delete", id: 2 }] },
    { paseo: host.paseo },
  );

  const view = watchReview(next, host, "w", review.writer);

  await vi.waitFor(() => {
    expect(view.told).toHaveLength(1);
  });
  review.told(reviewWatchRpc.event.parse(view.told[0]));

  expect(review.value().comments).toStrictEqual([]);
  await view.leave();
});
