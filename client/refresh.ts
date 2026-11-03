import type { QueryClient } from "@tanstack/react-query";

// How many milliseconds each wait lasts if nothing changes, as long as changes.wait allows, and how
// many to rest at least after a wait or a refresh fails, so that one that fails at once isn't tried
// again at once.
const timeout = 50_000;
const rest = 1000;

// What the changes are waited for with.
interface Waits {
  // Answers once the changes may have changed from the version, or with the same version once the
  // timeout is over.
  wait: (input: { version: string; timeout: number }) => Promise<{ version: string }>;
  // Answers the waits from the version at once, with it.
  release: (version: string) => Promise<void>;
}

// Shows the changes as they are once at the version, or later.
type Refresh = (version: string) => Promise<void>;

// Shows the changes as they are once at the version, or later, where it's known.
type Shows = (version?: string) => Promise<void>;

async function rested(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

// The version the wait from the version answers with, or undefined, after a rest, if it fails.
async function answerTo(wait: Waits["wait"], version: string): Promise<string | undefined> {
  try {
    const answered = await wait({ version, timeout });

    return answered.version;
  } catch {
    await rested(rest);

    return undefined;
  }
}

// The version to wait from next: the one the wait from this one answers with, once `refresh` is
// done if it's another, unless the signal says to stop by then. The same one, after a rest, if the
// wait or the refresh fails. Once a refresh is done, or fails, it rests twice as long as it took,
// so that while changes keep coming, refreshes take a third of the time at most.
async function waitFrom(
  version: string,
  wait: Waits["wait"],
  refresh: Refresh,
  stop: AbortSignal,
): Promise<string> {
  const answered = await answerTo(wait, version);

  if (answered === undefined) {
    return version;
  }

  if (answered === version || stop.aborted) {
    return answered;
  }

  const began = Date.now();

  try {
    await refresh(answered);
  } catch {
    await rested(Math.max(rest, 2 * (Date.now() - began)));

    return version;
  }

  await rested(2 * (Date.now() - began));

  return answered;
}

async function keepRefreshing(
  version: string,
  wait: Waits["wait"],
  refresh: Refresh,
  stop: AbortSignal,
): Promise<void> {
  if (stop.aborted) {
    return;
  }

  const next = await waitFrom(version, wait, refresh, stop);

  // Not awaited, so that the promises of a panel open for hours don't pile up.
  void keepRefreshing(next, wait, refresh, stop);
}

// Releases the waits from the version. One that can't be is over once its timeout is.
async function released(release: Waits["release"], version: string): Promise<void> {
  try {
    await release(version);
  } catch {
    // Over once its timeout is.
  }
}

// Calls `refresh` each time a wait answers with another version than the one it last refreshed
// for, starting from the version what's shown was read at, until the signal says to stop, when it
// releases the wait it's in. It refreshes again for a version whose refresh failed.
export function refreshOnChanges(
  waits: Waits,
  refresh: Refresh,
  from: string,
  stop: AbortSignal,
): void {
  let waiting: string | undefined;

  stop.addEventListener("abort", () => {
    if (waiting !== undefined) {
      void released(waits.release, waiting);
    }
  });

  void keepRefreshing(
    from,
    async (input) => {
      waiting = input.version;

      try {
        const answered = await waits.wait(input);

        return answered;
      } finally {
        waiting = undefined;
      }
    },
    refresh,
    stop,
  );
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
