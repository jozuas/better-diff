import type { QueryClient } from "@tanstack/react-query";

// How many milliseconds to rest at least after a refresh fails, so that one that fails at once
// isn't tried again at once.
const rest = 1000;

// Shows the changes as they are once at the version, or later.
type Refresh = (version: string) => Promise<void>;

// Shows the changes as they are once at the version, or later, where it's known.
type Shows = (version?: string) => Promise<void>;

async function rested(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

// What tells a view's refreshes of the changes.
export interface Following {
  // What's shown was first read at the version.
  read: (version: string) => void;
  // The changes are at the version now, as changes.watch tells of it.
  told: (version: string) => void;
}

// Calls `refresh` whenever the changes are told to be at another version than the one what's shown
// was last refreshed for, or first read at, once that's known, until the signal says to stop, one
// refresh at a time, for the version last told. Once a refresh is done, or fails, it rests twice as
// long as it took, so that while changes keep coming, refreshes take a third of the time at most,
// and a second at least after one that fails, which it then tries again.
export function refreshOnChanges(refresh: Refresh, stop: AbortSignal): Following {
  let shown: string | undefined;
  let now: string | undefined;
  let refreshing = false;

  async function keepRefreshing(): Promise<void> {
    if (refreshing || stop.aborted || shown === undefined || now === undefined || now === shown) {
      return;
    }

    const version = now;
    const began = Date.now();

    refreshing = true;

    try {
      await refresh(version);
      shown = version;
      await rested(2 * (Date.now() - began));
    } catch {
      await rested(Math.max(rest, 2 * (Date.now() - began)));
    }

    refreshing = false;
    // Not awaited, so that the promises of a panel open for hours don't pile up.
    void keepRefreshing();
  }

  return {
    read: (version) => {
      shown ??= version;
      void keepRefreshing();
    },
    told: (version) => {
      now = version;
      void keepRefreshing();
    },
  };
}

// A read of everything again, started once the changes were at the version, where it's known.
interface Read {
  version: string | undefined;
  failed: boolean;
  done: Promise<void>;
}

function started(version: string | undefined, read: () => Promise<void>): Read {
  const reading: Read = { version, failed: false, done: Promise.resolve() };

  async function done(): Promise<void> {
    try {
      await read();
    } catch (error) {
      reading.failed = true;

      throw error;
    }
  }

  reading.done = done();

  return reading;
}

// Shows the changes as they are once at the version given, or later, by reading everything again
// with `read`, unless the last read started once they were at the version and hasn't failed: then
// once that one has. Without a version, it always reads again.
function readOnce(read: () => Promise<void>): Shows {
  let last: Read | undefined;

  return async (version) => {
    if (version === undefined || last?.version !== version || last.failed) {
      last = started(version, read);
    }

    await last.done;
  };
}

// Reads each of the directory's queries that's shown again, from the start though it's being read
// already, as the first read of one is, and rejects if one fails. One read again before, still
// under way, is done once this one is.
async function readAgain(client: QueryClient, directory: string): Promise<void> {
  void client.cancelQueries({ queryKey: [directory], type: "active" }, { silent: true });
  await client.invalidateQueries({ queryKey: [directory] }, { throwOnError: true });
}

const refreshes = new WeakMap<QueryClient, Map<string, Shows>>();

// readOnce of readAgain of the directory's queries in the client, the same for every panel that
// shows them, so that one read serves them all.
export function refreshOf(client: QueryClient, directory: string): Shows {
  const ofClient = refreshes.get(client) ?? new Map<string, Shows>();
  const known = ofClient.get(directory);

  if (known !== undefined) {
    return known;
  }

  const refresh = readOnce(async () => {
    await readAgain(client, directory);
  });

  refreshes.set(client, ofClient.set(directory, refresh));

  return refresh;
}

// The version the changes were first read at, as their query has them: undefined until they're
// read, and an empty one, which none is, if they couldn't be.
export function readAt(changes: {
  isPending: boolean;
  data: { version: string } | undefined;
}): string | undefined {
  return changes.isPending ? undefined : (changes.data?.version ?? "");
}
