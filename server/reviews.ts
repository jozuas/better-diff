import { once } from "node:events";

import type { RpcInput, RpcOutput, SubscriptionEvent, SubscriptionInput } from "@getpaseo/plugin";
import type { PluginSubscriptionContext } from "@getpaseo/plugin/server";
import { z } from "zod";

import { changedBy, noReview, review } from "../shared/review";
import type { reviewChangeRpc, reviewWatchRpc } from "../shared/review";

// The key of a workspace's metadata its review is kept under.
const key = "better-diff.review";

// How many views' last writes a workspace keeps the numbers of.
const writersKept = 16;

// A workspace's review as its metadata keeps it: with the number of the last write made in it of
// each of the views that wrote it last, the latest last, so that a write sent again isn't made
// again, though the plugin's server started again since. Both are kept at once, so the workspace
// never keeps a write's changes without its number, or the number without them.
const kept = z.object({
  review,
  taken: z.array(z.tuple([z.string(), z.int().positive()])),
});

type Kept = z.infer<typeof kept>;

const stored = z.object({ [key]: kept });

const nothingKept: Kept = { review: noReview, taken: [] };

// What of Paseo's API the plugin's server keeps reviews on the host's workspaces with: a
// workspace's metadata, read anew, and what sets keys of it.
interface Host {
  workspaces: {
    ref: (workspace: string) => {
      refresh: () => Promise<{ metadata?: unknown } | null>;
      setMetadata: (patch: Record<string, z.core.util.JSONType>) => Promise<void>;
    };
  };
}

type Push = PluginSubscriptionContext<SubscriptionEvent<typeof reviewWatchRpc>>["push"];

// A view the review is told to as it changes, and the writer of its writes, if it writes any.
interface Watcher {
  writer: string | undefined;
  push: Push;
}

// What the server has of a workspace's review.
interface Held {
  // What the workspace keeps, as the server last read it or had it kept, which its views are told
  // of: unknown until it's read, and once keeping it fails, as the host may have kept it or not.
  kept: Kept | undefined;
  // What the server does with the review, each once the one before is done.
  turn: Promise<void>;
  watchers: Set<Watcher>;
}

// The workspace's review as its metadata keeps it, or none, or undefined where the host hasn't
// the workspace.
async function read(host: Host, workspace: string): Promise<Kept | undefined> {
  const found = await host.workspaces.ref(workspace).refresh();

  if (found === null) {
    return undefined;
  }

  const keeps = stored.safeParse(found.metadata);

  return keeps.success ? keeps.data[key] : nothingKept;
}

// The number of the writer's last write made in the review: none for a view that only reads, which
// has none, and for a writer the workspace no longer keeps the number of.
function takenOf({ taken }: Kept, writer: string | undefined): number {
  return taken.find(([each]) => each === writer)?.[1] ?? 0;
}

// The numbers with the writer's write, as the latest, without those of the writers that wrote
// longest ago, beyond as many as a workspace keeps.
function withTaken(taken: Kept["taken"], writer: string, write: number): Kept["taken"] {
  const latest: Kept["taken"][number] = [writer, write];

  return [...taken.filter(([each]) => each !== writer), latest].slice(-writersKept);
}

async function tell(now: Kept, { writer, push }: Watcher): Promise<void> {
  const event = { taken: takenOf(now, writer), review: now.review };

  try {
    await push(event);
  } catch {
    // Once the plugin is cut off from Paseo, no view is left to tell.
  }
}

async function tellAll(now: Kept, { watchers }: Held): Promise<void> {
  await Promise.all(
    [...watchers].map(async (watcher) => {
      await tell(now, watcher);
    }),
  );
}

async function after<Done>(before: Promise<void>, task: () => Promise<Done>): Promise<Done> {
  await before;

  const done = await task();

  return done;
}

async function over(doing: Promise<unknown>): Promise<void> {
  try {
    await doing;
  } catch {
    // What asked for it hears that it failed.
  }
}

// Does it once what the server was doing with the review is over, whether or not that failed.
async function inTurn<Done>(on: Held, task: () => Promise<Done>): Promise<Done> {
  const doing = after(on.turn, task);

  on.turn = over(doing);

  const done = await doing;

  return done;
}

// What the workspace keeps: read, where the server doesn't know, and told to the review's views,
// as it may be other than they were last told, where the host kept a write that seemed to fail, or
// the host hadn't the workspace when they started watching. Undefined where the host hasn't the
// workspace, which is read again by whatever needs it next.
async function keptOn(on: Held, host: Host, workspace: string): Promise<Kept | undefined> {
  if (on.kept !== undefined) {
    return on.kept;
  }

  const now = await read(host, workspace);

  if (now !== undefined) {
    on.kept = now;
    await tellAll(now, on);
  }

  return now;
}

type Watch = (
  input: SubscriptionInput<typeof reviewWatchRpc>,
  context: { paseo: Host; push: Push; signal: AbortSignal },
) => Promise<void>;

type Change = (
  input: RpcInput<typeof reviewChangeRpc>,
  context: { paseo: Host },
) => Promise<RpcOutput<typeof reviewChangeRpc>>;

// What serves the views of the host's workspaces' reviews.
interface Reviews {
  // Tells the view of the review now, and again each time it changes, until it leaves: of nothing
  // while the host hasn't the workspace, rather than refusing the view, which would ask again and
  // again.
  watch: Watch;
  // Makes the write's changes, unless the workspace keeps the write already, has the workspace
  // keep the review, tells the views of it, and answers. Fails where the host hasn't the workspace.
  change: Change;
}

// The reviews of the host's workspaces, which the server has its views watch and change, and keeps
// on the workspaces. The server makes each change in the order it reaches it, whichever view it's
// from, one at a time, so that one view's change never takes back another's, unless it changes the
// same thing. It tells the views only of what the workspace keeps, once it does, so a view is
// never told of a change that's then lost, and what the server has besides is only what it last
// read from the workspace or had it keep.
export function reviewsKept(): Reviews {
  const held = new Map<string, Held>();

  function heldOn(workspace: string): Held {
    const known = held.get(workspace);

    if (known !== undefined) {
      return known;
    }

    const on: Held = { kept: undefined, turn: Promise.resolve(), watchers: new Set() };

    held.set(workspace, on);

    return on;
  }

  return {
    watch: async ({ workspace, writer }, { paseo, push, signal }) => {
      if (signal.aborted) {
        return;
      }

      const left = once(signal, "abort");
      const on = heldOn(workspace);
      const watcher = { writer, push };

      try {
        await inTurn(on, async () => {
          const now = await keptOn(on, paseo, workspace);

          if (signal.aborted) {
            return;
          }

          on.watchers.add(watcher);

          if (now !== undefined) {
            await tell(now, watcher);
          }
        });
        await left;
      } finally {
        on.watchers.delete(watcher);
      }
    },
    change: async ({ workspace, writer, write, changes }, { paseo }) => {
      const on = heldOn(workspace);

      await inTurn(on, async () => {
        const before = await keptOn(on, paseo, workspace);

        if (before === undefined) {
          throw new Error(`Paseo has no workspace ${workspace}.`);
        }

        if (write <= takenOf(before, writer)) {
          return;
        }

        const now = {
          review: changedBy(before.review, changes),
          taken: withTaken(before.taken, writer, write),
        };

        on.kept = undefined;
        await paseo.workspaces.ref(workspace).setMetadata({ [key]: now });
        on.kept = now;
        await tellAll(now, on);
      });

      return {};
    },
  };
}
