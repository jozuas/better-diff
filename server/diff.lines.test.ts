import * as fc from "fast-check";
import { expect, test } from "vitest";

import {
  asShown,
  changedLines,
  fullDiff,
  selectedChanges,
  withSelectedChanges,
} from "../test/full-diff";
import { inRepository, timeout } from "../test/repository";
import {
  diffAlgorithm,
  file,
  fileState,
  operations,
  selectedLines,
  setUp,
  sides,
  targets,
} from "../test/staging";
import type { File } from "../test/staging";
import { applyLines, readDiff } from "./diff";

const abcd = Buffer.from("a\nb\nc\nd\n");

// Cases a fixed seed can miss. Staging a line added after one that had no newline, without that
// line's removal, in a file whose name looks like a hunk's start. A hunk that ends with lines
// removed after one added. An untracked file whose last line has no newline, which the index has
// deleted, with a name git quotes.
const examples: [File, "myers", (hunk: number, line: number) => boolean][] = [
  [
    {
      path: "@@ -1 +1 @@",
      versions: {
        head: Buffer.from("a\nb"),
        index: Buffer.from("a\nb"),
        worktree: Buffer.from("a\nb\nc\n"),
      },
    },
    "myers",
    (_, line) => line === 3,
  ],
  [
    { path: "a", versions: { head: abcd, index: abcd, worktree: Buffer.from("a\nX\nb\n") } },
    "myers",
    () => true,
  ],
  [
    {
      path: 'a "b"',
      versions: { head: abcd, index: undefined, worktree: Buffer.from("a\nX\nb") },
    },
    "myers",
    (_, line) => line !== 1,
  ],
];

test.each(operations)(
  "%s lines: makes or undoes exactly the selected changes",
  async (operation) => {
    await fc.assert(
      fc.asyncProperty(
        file,
        diffAlgorithm,
        fc.func(fc.boolean()),
        async ({ path, versions }, algorithm, isSelected) => {
          await inRepository(async (repository) => {
            setUp(repository, [{ path, versions }], algorithm);

            const side = sides[operation];
            const diff = await readDiff({ directory: repository, path, side });
            const changes = fullDiff(repository, path, side, versions);

            // With nothing changed, git prints no diff to work out the file from. The hunk
            // property covers that case.
            fc.pre(changes.length > 0);

            // Every change is shown, so every change can be selected.
            expect(changedLines(diff)).toStrictEqual(asShown(changes));

            const before = fileState(repository, path);

            const changed = withSelectedChanges(
              changes,
              selectedChanges(diff, isSelected),
              operation,
              versions,
            );

            await applyLines({
              directory: repository,
              path,
              operation,
              version: diff.version,
              lines: selectedLines(diff, isSelected),
            });

            expect(fileState(repository, path)).toStrictEqual({
              ...before,
              [targets[operation]]: changed,
            });
          });
        },
      ),
      { numRuns: 30, examples },
    );
  },
  timeout,
);
