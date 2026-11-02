import { once } from "node:events";

// What waits watch: how to check it, and what tells them to check it again.
export interface Watched {
  // The version of what's watched now, unless the signal says to stop.
  check: (stop: AbortSignal) => Promise<string>;
  // Calls `changed` whenever what's watched may have changed, and `failed` where it can't tell, or
  // once it no longer can, until the function it gives is called.
  listen: (changed: () => void, failed: () => void) => Promise<() => void>;
}

interface Waiter {
  version: string;
  // Whether a check that started after it asked has found its version.
  checked: boolean;
  // Whether its wait is over, so that its first check answers it, whatever version that finds.
  expired: boolean;
  // When its wait is over, by `performance.now()`.
  expires: number;
  // Answers with a version, or with the check that failed.
  answer: (version: string | Promise<string>) => void;
  // Ends its wait.
  expiring: ReturnType<typeof setTimeout> | undefined;
}

// The waits for one thing, which share its checks.
interface Watch {
  key: string;
  waiters: Set<Waiter>;
  // Whether checks are being made for the waiters.
  running: boolean;
  // When the last check ended, by `performance.now()`, how long it took, and what version the last
  // that didn't fail found.
  ended: number;
  took: number;
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

// How long a check can take before it's stopped, and fails: as long as the app waits for an
// answer. git status can hang on a hook, such as a file system monitor's, or on a file system.
const longest = 60_000;

// When the next check is due, from the end of the last one, which rests ten times as long as it
// took. One for a waiter that asked, since the last check started, with another version than it
// found waits no more than a second. One a change calls for, or, where nothing tells of changes,
// the next of the checks made every second, waits at least a second, and longer after a slow check,
// so that git status runs about a tenth of the time at most, however soon each waiter asks again
// once answered. Where something tells of changes, a check every half a minute or so finds those it
// misses, such as one to a file outside the repository that git reads, as core.excludesFile. For a
// waiter that asked with the version the last check found, one ends as its wait does, so that a
// check after it asked answers it then, or starts as soon as the rest allows once its wait is over.
function dueOf(watch: Watch, { works, changed }: Listening): number {
  const rest = 10 * watch.took;
  const soonest = watch.ended + Math.min(1000, rest);
  const unchecked = [...watch.waiters].filter(({ checked }) => !checked);

  if (unchecked.some(({ version }) => version !== watch.version)) {
    return soonest;
  }

  const interval = Math.max(1000, rest);
  const told = watch.ended + (changed || !works ? interval : 30 * interval);
  const expiring = Math.min(...unchecked.map(({ expires }) => expires - watch.took));

  return Math.max(soonest, Math.min(told, expiring));
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

function answer(watch: Watch, waiter: Waiter, version: string | Promise<string>): void {
  if (watch.waiters.delete(waiter)) {
    clearTimeout(waiter.expiring);
    waiter.answer(version);
  }
}

// Rejects with why the signal says to stop, once it does.
async function stoppedBy(signal: AbortSignal): Promise<never> {
  await once(signal, "abort");

  throw signal.reason;
}

// Checks for the waiters waiting as it starts: one that comes later can be answered only by a
// check that started after it asked.
async function check(watch: Watch, watched: Watched): Promise<void> {
  const asked = [...watch.waiters];
  const started = performance.now();
  const stopping = new AbortController();

  const limit = setTimeout(() => {
    stopping.abort();
  }, longest);

  const checking = Promise.race([watched.check(stopping.signal), stoppedBy(stopping.signal)]);

  try {
    const version = await checking;

    watch.version = version;

    for (const waiter of asked) {
      waiter.checked = true;

      if (waiter.version !== version || waiter.expired) {
        answer(watch, waiter, version);
      }
    }
  } catch {
    for (const waiter of asked) {
      answer(watch, waiter, checking);
    }
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

// Stops listening for the watch's waiters, and forgets them.
function forget(watch: Watch): void {
  clearTimeout(watch.lingering);
  watch.listening?.stop();
  watches.delete(watch.key);
}

// Rests until the next check is due, or makes it, and goes on while waiters wait. Listening goes on
// for a minute once no waiter is left, for the next one, unless waiting was stopped.
async function keepChecking(watch: Watch, watched: Watched): Promise<void> {
  if (watch.waiters.size === 0) {
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

function expire(watch: Watch, waiter: Waiter): void {
  if (waiter.checked) {
    answer(watch, waiter, waiter.version);
    watch.wake();
  } else {
    waiter.expired = true;
  }
}

// The version of what's watched once it differs from the one given, or once the wait is over. Waits
// for the same thing, which `key` names, share each check, and each is answered with the version
// from a check that started after it asked.
export async function changeFrom(
  key: string,
  watched: Watched,
  version: string,
  timeout: number,
): Promise<string> {
  const watch = watches.get(key) ?? {
    key,
    waiters: new Set(),
    running: false,
    ended: -Infinity,
    took: 0,
    version: undefined,
    wake: () => {},
    listening: undefined,
    lingering: undefined,
  };

  watches.set(key, watch);

  const changed = await new Promise<string>((resolve) => {
    const waiter: Waiter = {
      version,
      checked: false,
      expired: false,
      expires: performance.now() + timeout,
      answer: resolve,
      expiring: undefined,
    };

    watch.waiters.add(waiter);
    waiter.expiring = setTimeout(() => {
      expire(watch, waiter);
    }, timeout);

    if (watch.running) {
      watch.wake();
    } else {
      watch.running = true;
      clearTimeout(watch.lingering);
      // Once the waiters that ask at once have all asked, so that they share the first check.
      queueMicrotask(() => {
        void keepChecking(watch, watched);
      });
    }
  });

  return changed;
}

// Answers every wait with its own version, and stops listening, as the plugin stops.
export function stopWaiting(): void {
  for (const watch of watches.values()) {
    for (const waiter of watch.waiters) {
      answer(watch, waiter, waiter.version);
    }

    forget(watch);
    watch.wake();
  }
}
