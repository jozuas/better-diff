import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

import * as fc from "fast-check";
import { afterEach, expect, test, vi } from "vitest";

import { versionRpc, watchRpc } from "../shared/changes";
import { diffChanges, filesAndLater, writeLater } from "../test/groups";
import { inDirectory, inRepository, runGit, timeout, writeFile } from "../test/repository";
import { setUp } from "../test/staging";
import { listChanges, readVersion, watchChanges } from "./changes";
import { readGroup } from "./groups";
import { unsubscribeAll } from "./subscribers";

afterEach(() => {
  unsubscribeAll();
});

interface Watching {
  // The versions it was told of, as changes.watch's subscribers are.
  versions: string[];
  leave: () => void;
}

// Subscribes to the directory's changes, as a view of them does, through the subscription's input
// and event validation.
function watching(directory: string, leaving = new AbortController()): Watching {
  const versions: string[] = [];

  watchChanges(watchRpc.input.parse({ directory }), {
    push: async (event) => {
      versions.push(watchRpc.event.parse(event).version);
      await Promise.resolve();
    },
    signal: leaving.signal,
  });

  return {
    versions,
    leave: () => {
      leaving.abort();
    },
  };
}

// The versions the subscription was told of, once it's been told of as many.
async function toldOf({ versions }: Watching, count: number): Promise<string[]> {
  await vi.waitFor(
    () => {
      expect(versions.length).toBeGreaterThanOrEqual(count);
    },
    { timeout: 5000 },
  );

  return [...versions];
}

async function versionNow(directory: string): Promise<string> {
  const { version } = await readVersion({ directory });

  return version;
}

// Each group's files and their diffs, as a view of them shows them.
async function shown(directory: string): Promise<string> {
  const groups = await Promise.all(
    (["modified", "untracked", "staged"] as const).map(async (group) => {
      const { files: read } = await readGroup({ directory, group });

      return read;
    }),
  );

  return JSON.stringify(groups);
}

test("tells a subscriber the version now", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");

    const [version] = await toldOf(watching(repository), 1);

    expect(version).toMatch(/^[\da-f]{64}$/u);
    expect(version).toBe(await versionNow(repository));
  });
});

test("tells once a modified file changes again, though git status says the same, and of nothing more while nothing changes", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    runGit(repository, ["add", "--all"]);
    writeFile(repository, "a", "b\n");

    const subscription = watching(repository);
    const [version] = await toldOf(subscription, 1);
    const status = runGit(repository, ["status", "--porcelain=v2"]);

    await setTimeout(500);
    writeFile(repository, "a", "c\n");

    const [, changed] = await toldOf(subscription, 2);

    expect(runGit(repository, ["status", "--porcelain=v2"])).toBe(status);
    expect(changed).not.toBe(version);
    expect(changed).toBe(await versionNow(repository));

    await setTimeout(2500);

    expect(subscription.versions).toStrictEqual([version, changed]);
  });
}, 15_000);

// Once it listens, it checks a second after it started to, and then only once told of a change, as
// of one to the worktree, but not of one to excludes outside the repository, or half a minute after
// its last check. Were it to check every second, it would find both.
test("tells of a change made a while after its last check once told of it, and not of one nothing tells of", async () => {
  await inRepository(async (repository) => {
    await inDirectory(async (outside) => {
      writeFile(outside, "exclude", "");
      runGit(repository, ["config", "core.excludesFile", join(outside, "exclude")]);
      writeFile(repository, "a", "a\n");

      const subscription = watching(repository);
      const [version] = await toldOf(subscription, 1);

      await setTimeout(2500);
      writeFile(outside, "exclude", "a\n");
      await setTimeout(2500);

      expect(subscription.versions).toStrictEqual([version]);

      writeFile(repository, "b", "b\n");

      await expect(toldOf(subscription, 2)).resolves.toStrictEqual([
        version,
        await versionNow(repository),
      ]);
    });
  });
}, 30_000);

test("tells a subscriber that has left of no change", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");

    const stays = watching(repository);
    const leaves = watching(repository);
    const [version] = await toldOf(leaves, 1);

    leaves.leave();
    await setTimeout(1500);
    writeFile(repository, "a", "b\n");
    await toldOf(stays, 2);

    expect(leaves.versions).toStrictEqual([version]);
  });
}, 15_000);

test("tells a subscriber that had left before the server heard of it of nothing", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");

    const left = new AbortController();

    left.abort();

    const leaves = watching(repository, left);
    const stays = watching(repository);

    await toldOf(stays, 1);
    await setTimeout(100);

    expect(leaves.versions).toStrictEqual([]);
  });
});

test("a subscriber that can't be told, as once the plugin is cut off from Paseo, leaves no rejection unhandled", async () => {
  await inRepository(async (repository) => {
    const unhandled = vi.fn<() => void>();

    const push = vi.fn<(event: { version: string }) => Promise<void>>(async () => {
      await Promise.reject(new Error("The channel closed."));
    });

    writeFile(repository, "a", "a\n");
    process.on("unhandledRejection", unhandled);
    watchChanges({ directory: repository }, { push, signal: new AbortController().signal });
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledTimes(1);
    });
    await setTimeout(100);
    process.off("unhandledRejection", unhandled);

    expect(unhandled).not.toHaveBeenCalled();
  });
});

test(
  "the version stays the same while nothing changes, and changes whenever the files listed or their diffs do",
  async () => {
    await fc.assert(
      fc.asyncProperty(filesAndLater, async ([all, written]) => {
        await inRepository(async (repository) => {
          setUp(repository, all, "myers");

          const version = await versionNow(repository);
          const before = await shown(repository);

          await expect(versionNow(repository)).resolves.toBe(version);

          writeLater(repository, written);

          fc.pre((await shown(repository)) !== before);

          await expect(versionNow(repository)).resolves.not.toBe(version);
        });
      }),
      { numRuns: 30, examples: diffChanges },
    );
  },
  timeout,
);

test(
  "changes.list and changes.version answer with the version changes.watch tells of while the files are as they are",
  async () => {
    await fc.assert(
      fc.asyncProperty(filesAndLater, async ([all, written]) => {
        await inRepository(async (repository) => {
          setUp(repository, all, "myers");
          writeLater(repository, written);

          const { version: listed } = await listChanges({ directory: repository });
          const { version: now } = await readVersion({ directory: repository });
          const subscription = watching(repository);

          await expect(toldOf(subscription, 1)).resolves.toStrictEqual([listed]);
          expect(now).toBe(listed);

          subscription.leave();
          unsubscribeAll();
        });
      }),
      { numRuns: 20, examples: diffChanges },
    );
  },
  timeout,
);

test("changes.version answers the same through the RPC's input and output validation", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");

    const input = { directory: repository };
    const answer = await readVersion(input);

    expect(versionRpc.output.parse(await readVersion(versionRpc.input.parse(input)))).toStrictEqual(
      answer,
    );
  });
});
