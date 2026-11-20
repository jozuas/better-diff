// A subscription to what the plugin's server tells of, asked for again each time the server stops
// telling: how many times it has been, and how many of those in a row the server has told of
// nothing since.
export interface Subscribing {
  times: number;
  quiet: number;
}

export const firstSubscribing: Subscribing = { times: 0, quiet: 0 };

// The subscription once the server stops telling, which has it asked for again, or once the server
// tells of something: the same while that changes nothing of it.
export function subscribingAfter(now: Subscribing, heard: "ended" | "told"): Subscribing {
  if (heard === "ended") {
    return { times: now.times + 1, quiet: now.quiet + 1 };
  }

  return now.quiet === 0 ? now : { ...now, quiet: 0 };
}

// How many milliseconds after the server stops telling it's asked to again: a second, and twice as
// long each time it has told of nothing since it was last asked, up to ten seconds, so that a
// server that can't tell, as of a workspace it can't read, isn't asked every second.
export function restAfter({ quiet }: Subscribing): number {
  return Math.min(1000 * 2 ** quiet, 10_000);
}
