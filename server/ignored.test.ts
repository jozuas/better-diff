import { realpathSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

import * as fc from "fast-check";
import { expect, test, vi } from "vitest";

import { canCoexist, filePath } from "../test/file-names";
import { inRepository, runGit, timeout, writeFile } from "../test/repository";
import { Ignored } from "./ignored";

interface Hearing {
  // The paths it told of, relative to the worktree.
  told: string[];
  // Has it hear of a change to each path, relative to the worktree.
  hear: (...paths: string[]) => void;
  // Has it hear of a change to a path git doesn't ignore last, and waits until it tells of it, once
  // it has asked about those before.
  settle: () => Promise<void>;
  ignored: Ignored;
}

function hearing(repository: string): Hearing {
  const top = realpathSync(repository);
  const told: string[] = [];
  let settled = 0;

  const ignored = new Ignored(top, (path) => {
    told.push(path.slice(top.length + 1));
  });

  function hear(...paths: string[]): void {
    for (const path of paths) {
      ignored.heard(join(top, path));
    }
  }

  return {
    told,
    hear,
    settle: async () => {
      settled += 1;

      const last = `settled ${settled}`;

      hear(last);
      await vi.waitFor(() => {
        expect(told).toContain(last);
      });
      told.splice(told.indexOf(last), 1);
    },
    ignored,
  };
}

interface File {
  path: string;
  isIgnored: boolean;
}

// The file's path in the directory git ignores, where it is, or its own.
function pathOf({ path, isIgnored }: File): string {
  return isIgnored ? `ignored/${path}` : path;
}

// Paths to put in the directory git ignores, or not, as each says.
const paths = fc
  .array(fc.record({ path: filePath, isIgnored: fc.boolean() }), { minLength: 1 })
  .filter((files) => canCoexist(files.map(pathOf)));

test(
  "tells of each change but those git ignores, whatever characters their paths hold",
  async () => {
    await inRepository(async (repository) => {
      writeFile(repository, ".gitignore", "/ignored/\n");

      await fc.assert(
        fc.asyncProperty(paths, async (files) => {
          const { told, hear, settle } = hearing(repository);

          hear(...files.map(pathOf));
          await settle();

          expect(told.toSorted()).toStrictEqual(
            files
              .filter(({ isIgnored }) => !isIgnored)
              .map(({ path }) => path)
              .toSorted(),
          );
        }),
        { numRuns: 30 },
      );
    });
  },
  timeout,
);

test("tells of a change to a file in the index, though it's in a directory git ignores", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, ".gitignore", "ignored/\n");
    writeFile(repository, "ignored/a", "a\n");
    runGit(repository, ["add", "--force", "ignored/a"]);

    const { told, hear, settle } = hearing(repository);

    hear("ignored/a", "ignored/b");
    await settle();

    expect(told).toStrictEqual(["ignored/a"]);
  });
});

// Each path is told of each time, and asked about once: the answer it has stands though the
// .gitignore changes, until it's told to forget.
test("asks git about each path once, until told to forget", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, ".gitignore", "*.log\n");

    const { told, hear, settle, ignored } = hearing(repository);

    hear("a.log", "b");
    await settle();
    hear("b");
    await settle();
    writeFile(repository, ".gitignore", "");
    hear("a.log");
    await settle();

    expect(told).toStrictEqual(["b", "b"]);

    ignored.forget();
    hear("a.log");
    await settle();

    expect(told).toStrictEqual(["b", "b", "a.log"]);
  });
});

// It asks about `first` alone, and about the rest once it has. One outside the worktree has git
// fail, and it asks about `a.log` again.
test("tells of each path git can't say whether it ignores with others, and asks again later", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, ".gitignore", "*.log\n");

    const { told, hear, settle } = hearing(repository);

    hear("first", join("..", "outside"), "a.log");
    await settle();

    expect(told).toContain("a.log");

    hear("a.log");
    await settle();

    expect(told.filter((path) => path === "a.log")).toHaveLength(1);
  });
});

test("tells of nothing once stopped", async () => {
  await inRepository(async (repository) => {
    const { told, hear, ignored } = hearing(repository);

    hear("a");
    ignored.stop();
    await setTimeout(200);

    expect(told).toStrictEqual([]);
  });
});
