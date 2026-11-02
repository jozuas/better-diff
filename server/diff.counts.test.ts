import * as fc from "fast-check";
import { expect, test } from "vitest";

import { inRepository, runGit, timeout } from "../test/repository";
import { diffAlgorithm, diffCommands, file, intendToAdd, setUp } from "../test/staging";
import type { Diff } from "../test/staging";
import { readDiff } from "./diff";

// The numbers of lines `git diff --numstat -z` says a diff of one file adds and removes: none where
// it prints nothing, as for a file without changes.
function numstat(output: string): Pick<Diff, "added" | "removed"> {
  const [added = "0", removed = "0"] = output.split("\t");

  return { added: Number(added), removed: Number(removed) };
}

test.each(["unstaged", "staged"] as const)(
  "counts the lines the %s diff adds and removes as git diff --numstat does",
  async (side) => {
    await fc.assert(
      fc.asyncProperty(file, diffAlgorithm, async (changed, algorithm) => {
        await inRepository(async (repository) => {
          setUp(repository, [changed], algorithm);

          const { added, removed } = await readDiff({
            directory: repository,
            path: changed.path,
            side,
          });

          intendToAdd(repository, changed, side);

          const output = runGit(repository, [
            ...diffCommands[side],
            "--numstat",
            "-z",
            "--",
            changed.path,
          ]);

          expect({ added, removed }).toStrictEqual(numstat(output));
        });
      }),
      { numRuns: 30 },
    );
  },
  timeout,
);
