import * as fc from "fast-check";
import { expect, test } from "vitest";

import { canCoexist } from "../test/file-names";
import { inRepository, runGit, timeout, worktreeFile } from "../test/repository";
import { diffAlgorithm, file, linesOf, operations, setUp, sides } from "../test/staging";
import type { Diff, File, Operation, Side } from "../test/staging";
import { applyLines, readDiff } from "./diff";

// Git's own commands that ask about each hunk in turn whether to stage, unstage or discard it.
const interactiveCommands: Record<Operation, string> = {
  stage: "add",
  unstage: "reset",
  discard: "checkout",
};

// The acted on file, and others that must stay as they are.
const files = fc
  .record({ acted: file, others: fc.array(file, { maxLength: 2 }) })
  .filter(({ acted, others }) => canCoexist([acted, ...others].map(({ path }) => path)));

interface RepositoryState {
  index: string;
  worktree: (Buffer | undefined)[];
}

function state(repository: string, all: readonly File[]): RepositoryState {
  return {
    index: runGit(repository, ["write-tree"]),
    worktree: all.map(({ path }) => worktreeFile(repository, path)),
  };
}

// git's interactive commands leave out an untracked file, which the plugin's unstaged diff has as
// new, unless it's added with --intent-to-add.
function intendToAdd(repository: string, { path, versions }: File, side: Side): void {
  if (side === "unstaged" && versions.index === undefined && versions.worktree !== undefined) {
    runGit(repository, ["add", "--intent-to-add", "--", path]);
  }
}

// Answers to the interactive command: yes to each picked hunk, no to the others.
function answers(diff: Diff, isPicked: (hunk: number) => boolean): string {
  return diff.hunks.map((_, hunk) => (isPicked(hunk) ? "y\n" : "n\n")).join("");
}

test.each(operations)(
  "%s hunks as git's own interactive command does",
  async (operation) => {
    await fc.assert(
      fc.asyncProperty(
        files,
        diffAlgorithm,
        fc.func(fc.boolean()),
        async ({ acted, others }, algorithm, isPicked) => {
          const all = [acted, ...others];

          await inRepository(async (ours) => {
            await inRepository(async (gits) => {
              setUp(ours, all, algorithm);
              setUp(gits, all, algorithm);
              intendToAdd(gits, acted, sides[operation]);

              const diff = await readDiff({
                directory: ours,
                path: acted.path,
                side: sides[operation],
              });

              await applyLines({
                directory: ours,
                path: acted.path,
                operation,
                version: diff.version,
                lines: linesOf(diff, isPicked),
              });

              runGit(
                gits,
                [interactiveCommands[operation], "--patch", "--", acted.path],
                answers(diff, isPicked),
              );

              expect(state(ours, all)).toStrictEqual(state(gits, all));
            });
          });
        },
      ),
      { numRuns: 30 },
    );
  },
  timeout,
);
