import { once } from "node:events";

// What subscribers are told the version of: how to check it, and what tells them to check it again.
export interface Watched {
  // The version of what's watched now, unless the signal says to stop.
  check: (stop: AbortSignal) => Promise<string>;
  // Calls `changed` whenever what's watched may have changed, and `failed` where it can't tell, or
  // once it no longer can, until the function it gives is called.
  listen: (changed: () => void, failed: () => void) => Promise<() => void>;
}

interface Subscriber {
  // The version it was last told, if it's been told one.
  told: string | undefined;
  tell: (version: string) => void;
}

// The subscribers to one thing, which share its checks.
interface Watch {
  key: string;
  subscribers: Set<Subscriber>;
  // Whether checks are being made for the subscribers.
  running: boolean;
  // When the last check ended, by `performance.now()`, how long it took, whether it failed, and what
  // version the last that didn't fail found.
  ended: number;
  took: number;
  failed: boolean;
  version: string | undefined;
  // Ends the rest before the next check, to see whether one is due sooner.
  wake: () => void;
  // What tells of changes, while checks are made and for a minute after, and what stops it then.
  listening: Listening | undefined;
  lingering: ReturnType<typeof setTimeout> | undefined;
}

// What tells a watch of changes.
interface Listening {
  // Whether it tells of them: once it has started, until it fails. And whether it ever did.
  works: boolean;
  worked: boolean;
  // Whether it told of one since the last check started.
  changed: boolean;
  // When it failed, by `performance.now()`, if it has, and how long after that to listen anew.
  failed: number | undefined;
  retry: number;
  stop: () => void;
}

const watches = new Map<string, Watch>();

// How long a check can take before it's stopped, and fails. git status can hang on a hook, such as
// a file system monitor's, or on a file system.
const longest = 60_000;

// When the next check is due, from the end of the last one, which rests ten times as long as it
// took. One for a subscriber not yet told a version, as one that subscribed since the last check
// started, waits no more than a second. One a change calls for, or, where nothing tells of changes,
// the next of the checks made every second, waits at least a second, and longer after a slow check,
// so that git status runs about a tenth of the time at most, however many subscribe. So does the
// one after a check that failed, which may not fail again. Where something tells of changes, a
// check every half a minute or so finds those it misses, such as one to a file outside the
// repository that git reads, as core.excludesFile.
function dueOf(watch: Watch, { works, changed }: Listening): number {
  const rest = 10 * watch.took;
  const interval = Math.max(1000, rest);

  if (watch.failed) {
    return watch.ended + interval;
  }

  if ([...watch.subscribers].some(({ told }) => told === undefined)) {
    return watch.ended + Math.min(1000, rest);
  }

  return watch.ended + (changed || !works ? interval : 30 * interval);
}

async function restUntil(watch: Watch, until: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const resting = setTimeout(resolve, until - performance.now());

    watch.wake = () => {
      clearTimeout(resting);
      resolve();
    };
  });
}

// Rejects with why the signal says to stop, once it does.
async function stoppedBy(signal: AbortSignal): Promise<never> {
  await once(signal, "abort");

  throw signal.reason;
}

// Tells the subscribers there as it starts the version it finds, unless it's the one they were last
// told, or they've left by then: one that comes later can be told only by a check that started
// after it subscribed.
async function check(watch: Watch, watched: Watched): Promise<void> {
  const subscribed = [...watch.subscribers];
  const started = performance.now();
  const stopping = new AbortController();

  const limit = setTimeout(() => {
    stopping.abort();
  }, longest);

  try {
    const version = await Promise.race([
      watched.check(stopping.signal),
      stoppedBy(stopping.signal),
    ]);

    watch.version = version;
    watch.failed = false;

    for (const subscriber of subscribed) {
      if (subscriber.told !== version && watch.subscribers.has(subscriber)) {
        subscriber.told = version;
        subscriber.tell(version);
      }
    }
  } catch {
    watch.failed = true;
  }

  clearTimeout(limit);
  watch.ended = performance.now();

  // One stopped says nothing of how long the next takes.
  if (!stopping.signal.aborted) {
    watch.took = watch.ended - started;
  }
}

function fail(watch: Watch, listening: Listening): void {
  listening.works = false;
  listening.failed = performance.now();
  listening.stop();
  watch.wake();
}

// Has the listening tell the watch of changes once it has started, unless it has failed by then,
// and stops it once it's told to, though that be before it has started. Until it has started, the
// next check is due as soon as it would be once told of a change. Listening that can't start, or
// stop, fails as listening that can't tell does.
async function startListening(
  watch: Watch,
  watched: Watched,
  listening: Listening,
  stopped: AbortSignal,
): Promise<void> {
  try {
    const stop = await watched.listen(
      () => {
        listening.changed = true;
        watch.wake();
      },
      () => {
        fail(watch, listening);
      },
    );

    if (listening.failed === undefined) {
      // A change made while it started is one the next check finds.
      listening.works = true;
      listening.worked = true;
      listening.changed = true;
    }

    if (!stopped.aborted) {
      await once(stopped, "abort");
    }

    stop();
  } catch {
    fail(watch, listening);
  }
}

// What tells the watch of changes: what told it last, unless that failed a minute ago or more, so
// that listening that keeps failing starts again only once a minute. Where it fails again before it
// told of anything, as where the system has no more watches to give, it waits twice as long before
// it starts again, up to an hour: each time, it takes the watches it can before it fails. Checks
// are made while it starts, as on Linux that takes long in a large repository.
function listeningFor(watch: Watch, watched: Watched): Listening {
  const { listening } = watch;

  if (
    listening !== undefined &&
    (listening.failed ?? Infinity) > performance.now() - listening.retry
  ) {
    return listening;
  }

  const stopping = new AbortController();

  const started: Listening = {
    works: false,
    worked: false,
    // Stryker disable next-line BooleanLiteral: before it has started, a check is due as soon as it is where it told of a change, and starting has it tell of one.
    changed: false,
    failed: undefined,
    retry: listening?.worked === false ? Math.min(2 * listening.retry, 3_600_000) : 60_000,
    stop: () => {
      stopping.abort();
    },
  };

  watch.listening = started;
  void startListening(watch, watched, started, stopping.signal);

  return started;
}

// Whether a check found a change listening wasn't told of before or as it ran, though listening
// works: one it can miss again, as one to a file outside the repository that git reads, such as
// core.excludesFile, after which git lists files in a directory nothing watches on Linux. Listening
// anew watches it.
function missed(listening: Listening, told: boolean, changed: boolean): boolean {
  return listening.works && !told && !listening.changed && changed;
}

// Stops listening for the watch's subscribers, and forgets it.
function forget(watch: Watch): void {
  clearTimeout(watch.lingering);
  watch.listening?.stop();
  watches.delete(watch.key);
}

// Rests until the next check is due, or makes it, and goes on while it has subscribers. Listening
// goes on for a minute once none is left, for the next one, unless the watch was forgotten.
async function keepChecking(watch: Watch, watched: Watched): Promise<void> {
  if (watch.subscribers.size === 0) {
    watch.running = false;

    if (watches.get(watch.key) === watch) {
      watch.lingering = setTimeout(() => {
        forget(watch);
      }, 60_000);
    }

    return;
  }

  const listening = listeningFor(watch, watched);
  const due = dueOf(watch, listening);

  if (performance.now() < due) {
    await restUntil(watch, due);
  } else {
    const { version } = watch;
    const told = listening.changed;

    listening.changed = false;
    await check(watch, watched);

    if (missed(listening, told, watch.version !== version)) {
      listening.stop();
      watch.listening = undefined;
    }
  }

  void keepChecking(watch, watched);
}

// Tells of the version of what's watched, which `key` names, as a check that started after this
// finds it, and then whenever a check finds another, until the function it gives is called.
// Subscribers to the same thing share each check.
export function subscribe(
  key: string,
  watched: Watched,
  tell: (version: string) => void,
): () => void {
  const watch = watches.get(key) ?? {
    key,
    subscribers: new Set(),
    running: false,
    ended: -Infinity,
    took: 0,
    // Stryker disable next-line BooleanLiteral: the first check is due at once, whether or not one before it failed.
    failed: false,
    version: undefined,
    wake: () => {},
    listening: undefined,
    lingering: undefined,
  };

  const subscriber: Subscriber = { told: undefined, tell };

  watches.set(key, watch);
  watch.subscribers.add(subscriber);

  if (watch.running) {
    watch.wake();
  } else {
    watch.running = true;
    clearTimeout(watch.lingering);
    // Once those that subscribe at once all have, so that they share the first check.
    queueMicrotask(() => {
      void keepChecking(watch, watched);
    });
  }

  return () => {
    watch.subscribers.delete(subscriber);
    watch.wake();
  };
}

// Tells no subscriber any more, and stops listening, as the plugin stops.
export function unsubscribeAll(): void {
  for (const watch of watches.values()) {
    watch.subscribers.clear();
    forget(watch);
    watch.wake();
  }
}
