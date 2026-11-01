import { setTimeout } from "node:timers/promises";

import * as fc from "fast-check";
import { expect, test } from "vitest";

import { waitRpc } from "../shared/changes";
import { fileVersions } from "../test/file-contents";
import { canCoexist, filePath } from "../test/file-names";
import { files } from "../test/groups";
import { inRepository, runGit, timeout, writeFile } from "../test/repository";
import { setUp, writeVersion } from "../test/staging";
import { waitForChanges } from "./changes";
import { readGroup } from "./groups";

// The version now, which waiting with any other answers with at once.
async function versionNow(directory: string): Promise<string> {
  const { version } = await waitForChanges({ directory, version: "", timeout: 0 });

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

// A file written later, which can be one already there, or a new one.
const later = fc.record({ path: filePath, versions: fileVersions });

test(
  "the version stays the same while nothing changes, and changes whenever the files listed or their diffs do",
  async () => {
    await fc.assert(
      fc.asyncProperty(files, later, async (all, written) => {
        const paths = all.map(({ path }) => path);

        fc.pre(canCoexist([...paths.filter((path) => path !== written.path), written.path]));

        await inRepository(async (repository) => {
          setUp(repository, all, "myers");

          const version = await versionNow(repository);
          const before = await shown(repository);

          await expect(versionNow(repository)).resolves.toBe(version);

          writeVersion(repository, written.path, written.versions.index);
          runGit(repository, ["add", "--all"]);
          writeVersion(repository, written.path, written.versions.worktree);

          fc.pre((await shown(repository)) !== before);

          await expect(versionNow(repository)).resolves.not.toBe(version);
        });
      }),
      { numRuns: 30 },
    );
  },
  timeout,
);

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
