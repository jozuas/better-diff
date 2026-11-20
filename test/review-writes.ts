import { z } from "zod";

import type { reviewsKept } from "../server/reviews";
import { changedBy, noReview, review } from "../shared/review";
import type { Review, ReviewChange } from "../shared/review";
import { reviewHost } from "./review-host";
import type { ReviewHost } from "./review-host";

type Reviews = ReturnType<typeof reviewsKept>;

// The key of a workspace's metadata its review is kept under.
export const reviewKey = "better-diff.review";

const kept = z.object({ review, taken: z.array(z.tuple([z.string(), z.number()])) });

export const comment = { path: "a.txt", side: "new", line: 3, id: 2, body: "Why?" } as const;

export const added: ReviewChange = { kind: "add", comment };

export function typed(text: string): ReviewChange {
  return { kind: "message", text };
}

// A host with the workspace, which keeps nothing yet.
export function hostWith(workspace = "w"): ReviewHost {
  const host = reviewHost();

  host.add(workspace);

  return host;
}

// What the workspace's metadata keeps of its review, if anything.
export function keptOn(host: ReviewHost): z.infer<typeof kept> | undefined {
  return kept.optional().parse(host.metadata("w")?.[reviewKey]);
}

// The review the workspace keeps, or none.
export function keptReview(host: ReviewHost): Review {
  return keptOn(host)?.review ?? noReview;
}

// One of a view's writes, as it sends it to the server.
export interface Write {
  writer: string;
  write: number;
  changes: ReviewChange[];
}

export async function change(reviews: Reviews, host: ReviewHost, write: Write): Promise<void> {
  await reviews.change({ workspace: "w", ...write }, { paseo: host.paseo });
}

// Once what's under way has gone as far as it can.
export async function settled(): Promise<void> {
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
}

// Does it with each, one after another.
export async function inTurn<Item>(
  items: readonly Item[],
  act: (item: Item) => Promise<void>,
): Promise<void> {
  const [first, ...rest] = items;

  if (first !== undefined) {
    await act(first);
    await inTurn(rest, act);
  }
}

// What becomes of a write as it reaches the host: kept and answered, refused, or kept though its
// answer is lost.
export type Outcome = "kept" | "refused" | "lost";

// A view's turn to write: its last write again, while that wasn't answered, as a view sends it
// until it is, or else its next, of the changes, with what becomes of it at the host, and whether
// the plugin's server starts again before it.
interface Turn {
  writer: string;
  changes: ReviewChange[];
  outcome: Outcome;
  restarts: boolean;
}

interface Resending {
  take: (turn: Turn) => Promise<void>;
  // Sends each write not answered yet once more, which the host keeps and answers.
  finish: () => Promise<void>;
  // The review the workspace should keep, and the number of the last write made in it of each
  // view.
  expected: () => { review: Review; taken: Map<string, number> };
}

// Views that write to the host's workspace through the plugin's server, as started anew each time
// it starts again, each sending a write until it's answered, with what the workspace should keep
// then: each write's changes made once, in the order the host first kept the writes in.
export function resending(host: ReviewHost, start: () => Reviews): Resending {
  const unanswered = new Map<string, Write>();
  const last = new Map<string, number>();
  const made = new Map<string, number>();
  let reviews = start();
  let expected = noReview;

  async function send(write: Write, outcome: Outcome): Promise<void> {
    host.fail(outcome === "refused");
    host.lose(outcome === "lost");

    if (outcome !== "refused" && (made.get(write.writer) ?? 0) < write.write) {
      made.set(write.writer, write.write);
      expected = changedBy(expected, write.changes);
    }

    try {
      await change(reviews, host, write);
      unanswered.delete(write.writer);
    } catch {
      unanswered.set(write.writer, write);
    }
  }

  return {
    take: async ({ writer, changes, outcome, restarts }) => {
      if (restarts) {
        reviews = start();
      }

      const next = { writer, write: (last.get(writer) ?? 0) + 1, changes };
      const write = unanswered.get(writer) ?? next;

      last.set(writer, write.write);
      await send(write, outcome);
    },
    finish: async () => {
      await inTurn([...unanswered.values()], async (write) => {
        await send(write, "kept");
      });
    },
    expected: () => ({ review: expected, taken: made }),
  };
}
