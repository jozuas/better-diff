import * as fc from "fast-check";
import { expect, test } from "vitest";

import { asNumbered } from "../test/comments";
import { filePath } from "../test/file-names";
import { hunkLines } from "../test/hunk-lines";
import { fileKey, numberIn, numbered, reviewedFile } from "./numbering";
import type { CommentedFile, Numbering } from "./numbering";

const diffs = fc.constantFrom<CommentedFile["diff"]>("unstaged", "staged");

const file = fc.record({ diff: diffs, path: filePath });

function sameDiff(one: CommentedFile, other: CommentedFile): boolean {
  return one.diff === other.diff && one.path === other.path;
}

test("two diffs have the same key only if they're the same diff of the same file", () => {
  fc.assert(
    fc.property(file, file, (one, other) => {
      expect(fileKey(one) === fileKey(other)).toBe(sameDiff(one, other));
    }),
  );
});

test("a file whose diffs change nothing of each other's versions has its lines numbered as its diffs number them", () => {
  fc.assert(
    fc.property(hunkLines, fc.constantFrom("old", "new"), (lines, side) => {
      expect(lines.map((line) => numbered(line, side, asNumbered))).toStrictEqual(
        lines.map((line) => numberIn(line, side)),
      );
    }),
  );
});

// What the numbering gives each number up to a few past the lines the diffs number.
function mapped(numbering: Numbering | undefined) {
  return (["old", "new"] as const).map((side) =>
    Array.from({ length: 4 }, (_, at) => numbering?.[side](at + 1)),
  );
}

function oneLine(kind: "added" | "removed") {
  return { kind, text: "x", newline: true, runs: [] };
}

// A partly staged file's diffs: the index adds a line before HEAD's, and the worktree removes the
// index's second.
const staged = [{ oldStart: 0, newStart: 1, lines: [oneLine("added")] }];
const unstaged = [{ oldStart: 2, newStart: 1, lines: [oneLine("removed")] }];

test("a partly staged file's diff, as read, is numbered by its other diff's hunks", () => {
  const unstagedFile = reviewedFile(
    { diff: "unstaged", path: "a.txt" },
    { review: { other: staged } },
  );

  const stagedFile = reviewedFile(
    { diff: "staged", path: "a.txt" },
    { review: { other: unstaged } },
  );

  expect(mapped(unstagedFile?.numbering)).toStrictEqual([
    [undefined, 1, 2, 3],
    [1, 2, 3, 4],
  ]);
  expect(mapped(stagedFile?.numbering)).toStrictEqual([
    [1, 2, 3, 4],
    [1, undefined, 2, 3],
  ]);
  expect([unstagedFile?.path, stagedFile?.path]).toStrictEqual(["a.txt", "a.txt"]);
});

test("a diff read without what the review numbers its lines by, as while its file's diffs were read of different lines of the index, isn't numbered", () => {
  expect(reviewedFile({ diff: "unstaged", path: "a.txt" }, {})).toBeUndefined();
});
