import type { RpcInput, RpcOutput, SubscriptionEvent } from "@getpaseo/plugin";

import { changedBy, noReview, reviewChange } from "../shared/review";
import type {
  Review,
  ReviewChange,
  ReviewComment,
  reviewChangeRpc,
  reviewWatchRpc,
} from "../shared/review";
import { debounced } from "./debounce";

// What tells a view from every other, on this client and the host's others.
function newWriter(): string {
  return `${Date.now()}-${Math.random()}`;
}

// What the plugin's server tells a view of the workspace's review.
type Told = SubscriptionEvent<typeof reviewWatchRpc>;

// One of a view's writes, as the server takes it.
type Write = Omit<RpcInput<typeof reviewChangeRpc>, "workspace">;

// The review as a view shows it, with what changes it.
export interface ReviewState {
  comments: readonly ReviewComment[];
  message: string;
  onChange: (...changes: ReviewChange[]) => void;
}

// A view's review of the workspace, as the plugin's server keeps it.
export interface Reviewing {
  // What tells the view's writes from others'.
  writer: string;
  // What the view shows, the same until it changes, and what hears that it has, until the function
  // it gives is called.
  value: () => Review;
  subscribe: (listener: () => void) => () => void;
  // Makes the changes, which show at once, and resolves once the workspace keeps them.
  change: (...changes: ReviewChange[]) => Promise<void>;
  // Hears what the server tells of the review.
  told: (told: Told) => void;
}

interface Keeping {
  writer: string;
  // Sends a write to the server, which answers once the workspace keeps it.
  send: (write: Write) => Promise<void>;
  // Hears that a change couldn't be kept.
  failed: () => void;
}

// How many milliseconds after a write couldn't be kept it's tried again.
const retryAfter = 5000;

interface Written {
  write: number;
  changes: ReviewChange[];
  kept: (() => void)[];
}

// The review as the server last told of it, with the view's own changes it hasn't told of yet made
// after it, in the order the view made them. The server tells only of what the workspace keeps,
// with how many of the view's writes are made in it, so what a view is told of is never taken
// back, though the server starts again, and a write shows over it until the server tells of it,
// whether its answer or what the server tells reaches the view first. The view sends its changes
// to the server one write at a time, in turn, the changes made while one is under way together in
// the next, so that the server makes them in the order the view made them. The server makes each view's write after those that
// reached it before, so a change of another view's shows, under this view's own, once the server
// tells of it, and once it tells of this view's too, they're as the server has them, as on every
// other view. A write that can't be kept still shows, says so, and is tried again every five
// seconds, without saying so again, until it's kept, or at once with the next change, which says so
// again where it fails.
function reviewing({ writer, send, failed }: Keeping): Reviewing {
  const listeners = new Set<() => void>();
  let heard = noReview;
  // The writes not yet kept, in turn, and those the server hasn't told of yet.
  const unkept: Written[] = [];
  let unseen: Written[] = [];
  // The changes made since the last write started, and what hears that they're kept.
  let unsent: ReviewChange[] = [];
  let unsentKept: (() => void)[] = [];
  let written = 0;
  let sending = false;
  const retrying = debounced(retryAfter);
  let shown = noReview;

  function show(): void {
    const next = changedBy(heard, [...unseen.flatMap(({ changes }) => changes), ...unsent]);

    if (JSON.stringify(next) !== JSON.stringify(shown)) {
      shown = next;

      for (const listener of listeners) {
        listener();
      }
    }
  }

  // The first write not yet kept, or else one of the changes made since.
  function nextWrite(): Written | undefined {
    if (unkept[0] !== undefined || unsent.length === 0) {
      return unkept[0];
    }

    written += 1;

    const next = { write: written, changes: unsent, kept: unsentKept };

    unsent = [];
    unsentKept = [];
    unkept.push(next);
    unseen.push(next);

    return next;
  }

  async function sendNext(again: boolean): Promise<void> {
    const next = sending ? undefined : nextWrite();

    if (next === undefined) {
      return;
    }

    sending = true;

    try {
      await send({ writer, write: next.write, changes: next.changes });
      unkept.shift();
      sending = false;

      for (const kept of next.kept) {
        kept();
      }

      void sendNext(false);
    } catch {
      sending = false;

      if (!again) {
        failed();
      }

      retrying.set(() => {
        void sendNext(true);
      });
    }
  }

  return {
    writer,
    value: () => shown,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    change: async (...changes) => {
      if (changes.length === 0) {
        return;
      }

      // As the server reads them, so that the view shows what it will.
      const read = changes.map((change) => reviewChange.parse(change));

      const typed = read.some((change) => change.kind === "message" && change.said === undefined);

      // A message typed takes the place of those typed before that haven't been sent yet.
      unsent = [...unsent.filter((change) => !typed || change.kind !== "message"), ...read];
      show();

      await new Promise<void>((resolve) => {
        unsentKept.push(resolve);
        void sendNext(false);
      });
    },
    told: ({ taken, review }) => {
      heard = review;
      unseen = unseen.filter(({ write }) => write > taken);
      show();
    },
  };
}

// What a view sends its writes to the plugin's server with, and hears that a change couldn't be
// kept with.
export interface Sending {
  change: (input: RpcInput<typeof reviewChangeRpc>) => Promise<RpcOutput<typeof reviewChangeRpc>>;
  failed: () => void;
}

// A view's review of the workspace, as reviewing has it, of a writer of its own, sending its
// writes, and hearing those that couldn't be kept, with the latest of what does each.
export function reviewingThrough(
  workspace: string,
  latest: { readonly current: Sending },
): Reviewing {
  return reviewing({
    writer: newWriter(),
    send: async (write) => {
      await latest.current.change({ workspace, ...write });
    },
    failed: () => {
      latest.current.failed();
    },
  });
}

// What a workspace's row in Paseo's sidebar says of that many comments pending.
export function badgeLabel(count: number): string {
  return count === 1 ? "1 comment" : `${count} comments`;
}
