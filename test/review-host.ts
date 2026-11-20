import type { SubscriptionEvent } from "@getpaseo/plugin";
import type { z } from "zod";

import type { reviewsKept } from "../server/reviews";
import type { reviewWatchRpc } from "../shared/review";

type Told = SubscriptionEvent<typeof reviewWatchRpc>;

type Reviews = ReturnType<typeof reviewsKept>;

// What of Paseo's API the plugin's server keeps reviews with.
type Host = Parameters<Reviews["change"]>[1]["paseo"];

type Json = z.core.util.JSONType;

type Metadata = Record<string, Json>;

// A host's workspaces, as Paseo's API reads and sets their metadata for the plugin's server, and
// what the server asked of it.
export interface ReviewHost {
  paseo: Host;
  // The workspace's metadata now, or undefined for a workspace the host hasn't.
  metadata: (workspace: string) => Metadata | undefined;
  // Has the host have the workspace, with the metadata.
  add: (workspace: string, metadata?: Metadata) => void;
  // How many times the server read a workspace, and set its metadata.
  reads: () => number;
  writes: () => number;
  // Has each write that reaches the host from now on fail, or not.
  fail: (fails: boolean) => void;
  // Has each write that reaches the host from now on fail, though the host keeps it, as where its
  // answer is lost, or not.
  lose: (loses: boolean) => void;
  // Has each write wait until the function it gives is called, from now on, or not.
  hold: (holds: boolean) => void;
  release: () => void;
}

// What the wire makes of what's sent across it.
function across<Value>(value: Value): Value {
  return structuredClone(value);
}

export function reviewHost(): ReviewHost {
  const workspaces = new Map<string, Metadata>();
  let reads = 0;
  let writes = 0;
  let fails = false;
  let loses = false;
  let holds = false;
  const held: (() => void)[] = [];

  const paseo: Host = {
    workspaces: {
      ref: (workspace) => ({
        refresh: async () => {
          reads += 1;
          await Promise.resolve();

          const metadata = workspaces.get(workspace);

          return metadata === undefined ? null : { metadata: across(metadata) };
        },
        setMetadata: async (patch) => {
          // As it was asked to when the write reached it, whatever it's asked to meanwhile.
          const failing = fails;
          const losing = loses;

          writes += 1;

          if (holds) {
            await new Promise<void>((resolve) => {
              held.push(resolve);
            });
          }

          if (failing) {
            throw new Error("The host can't keep it.");
          }

          const patched = { ...workspaces.get(workspace), ...across(patch) };

          workspaces.set(
            workspace,
            Object.fromEntries(Object.entries(patched).filter(([, value]) => value !== null)),
          );

          if (losing) {
            throw new Error("The host's answer is lost.");
          }
        },
      }),
    },
  };

  return {
    paseo,
    metadata: (workspace) => workspaces.get(workspace),
    add: (workspace, metadata = {}) => {
      workspaces.set(workspace, metadata);
    },
    reads: () => reads,
    writes: () => writes,
    fail: (failing) => {
      fails = failing;
    },
    lose: (losing) => {
      loses = losing;
    },
    hold: (holding) => {
      holds = holding;
    },
    release: () => {
      for (const resolve of held.splice(0)) {
        resolve();
      }
    },
  };
}

// A view of the workspace's review: what the server told it, in turn, the last of that, and what
// has it leave, once the server lets it.
export interface Watching {
  told: Told[];
  watched: Promise<void>;
  last: () => Told | undefined;
  leave: () => Promise<void>;
}

// A view of the workspace's review, which the server tells of it, until it leaves.
export function watchReview(
  reviews: Reviews,
  host: ReviewHost,
  workspace: string,
  writer?: string,
): Watching {
  const told: Told[] = [];
  const leaving = new AbortController();

  const watched = reviews.watch(writer === undefined ? { workspace } : { workspace, writer }, {
    paseo: host.paseo,
    push: async (event) => {
      told.push(structuredClone(event));
      await Promise.resolve();
    },
    signal: leaving.signal,
  });

  return {
    told,
    watched,
    last: () => told.at(-1),
    leave: async () => {
      leaving.abort();
      await watched;
    },
  };
}
