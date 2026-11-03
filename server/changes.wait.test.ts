import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

import * as fc from "fast-check";
import { afterEach, expect, test } from "vitest";

import { releaseRpc, versionRpc, waitRpc } from "../shared/changes";
import { diffChanges, filesAndLater, writeLater } from "../test/groups";
import { inDirectory, inRepository, runGit, timeout, writeFile } from "../test/repository";
import { setUp } from "../test/staging";
import { listChanges, readVersion, releaseWaits, waitForChanges } from "./changes";
import { readGroup } from "./groups";
import { stopWaiting } from "./wait";

afterEach(() => {
  stopWaiting();
});

// The version now, which waiting with any other answers with once it has looked. Waiting stops,
// so that the next wait looks at once.
async function versionNow(directory: string): Promise<string> {
  const { version } = await waitForChanges({ directory, version: "", timeout: 0 });

  stopWaiting();

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

test("answers at once with the version now when given another", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");

    const { version } = await waitForChanges({
      directory: repository,
      version: "",
      timeout: 50_000,
    });

    expect(version).toMatch(/^[\da-f]{64}$/u);
  });
});

test("answers with the same version once the wait is over, when nothing has changed", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");

    const version = await versionNow(repository);

    await expect(
      waitForChanges({ directory: repository, version, timeout: 100 }),
    ).resolves.toStrictEqual({ version });
  });
});

test("answers once a modified file changes again, though git status says the same", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    runGit(repository, ["add", "--all"]);
    writeFile(repository, "a", "b\n");

    const version = await versionNow(repository);
    const status = runGit(repository, ["status", "--porcelain=v2"]);
    const waiting = waitForChanges({ directory: repository, version, timeout: 20_000 });

    await setTimeout(500);
    writeFile(repository, "a", "c\n");

    const { version: changed } = await waiting;

    expect(runGit(repository, ["status", "--porcelain=v2"])).toBe(status);
    expect(changed).not.toBe(version);
    expect(changed).toBe(await versionNow(repository));
  });
}, 10_000);

// Once it listens, it checks a second after it started to, and then only once told of a change, as
// of one to the worktree, but not of one to excludes outside the repository, or as a wait is about
// to be over, or half a minute after its last check. Were it to check every second, it would find
// both.
test("answers with a change made a while after its last check once told of it, and not with one nothing tells of", async () => {
  await inRepository(async (repository) => {
    await inDirectory(async (outside) => {
      writeFile(outside, "exclude", "");
      runGit(repository, ["config", "core.excludesFile", join(outside, "exclude")]);
      writeFile(repository, "a", "a\n");

      const version = await versionNow(repository);
      const untold = waitForChanges({ directory: repository, version, timeout: 5000 });

      await setTimeout(2500);
      writeFile(outside, "exclude", "a\n");

      await expect(untold).resolves.toStrictEqual({ version });

      const told = waitForChanges({ directory: repository, version, timeout: 40_000 });

      await setTimeout(2500);
      writeFile(repository, "b", "b\n");

      await expect(Promise.race([told, setTimeout(5000, { version })])).resolves.not.toStrictEqual({
        version,
      });
    });
  });
}, 30_000);

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
  "changes.list and changes.version answer with the version a wait answers with while the files are as they are",
  async () => {
    await fc.assert(
      fc.asyncProperty(filesAndLater, async ([all, written]) => {
        await inRepository(async (repository) => {
          setUp(repository, all, "myers");
          writeLater(repository, written);

          const { version: listed } = await listChanges({ directory: repository });
          const { version: now } = await readVersion({ directory: repository });

          await expect(versionNow(repository)).resolves.toBe(listed);
          expect(now).toBe(listed);
        });
      }),
      { numRuns: 20, examples: diffChanges },
    );
  },
  timeout,
);

test("releasing the waits from a version answers them at once, with it", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");

    const version = await versionNow(repository);
    const waiting = waitForChanges({ directory: repository, version, timeout: 20_000 });

    releaseWaits(releaseRpc.input.parse({ directory: repository, version }));

    await expect(Promise.race([waiting, setTimeout(5000, "still waiting")])).resolves.toStrictEqual(
      { version },
    );
  });
}, 10_000);

test("changes.version and changes.release answer the same through the RPCs' input and output validation", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");

    const input = { directory: repository };
    const answer = await readVersion(input);

    expect(versionRpc.output.parse(await readVersion(versionRpc.input.parse(input)))).toStrictEqual(
      answer,
    );
    expect(
      releaseRpc.output.parse(releaseWaits(releaseRpc.input.parse({ ...input, version: "" }))),
    ).toStrictEqual({});
  });
});

test("answers the same through the RPC's input and output validation", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");

    const input = { directory: repository, version: "", timeout: 0 };
    const answer = await waitForChanges(input);

    expect(waitRpc.output.parse(await waitForChanges(waitRpc.input.parse(input)))).toStrictEqual(
      answer,
    );
  });
});
