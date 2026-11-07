import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { diffRpc } from "../shared/diff";
import { asNumbered, diffHunks } from "../test/comments";
import { filePath } from "../test/file-names";
import { hunkLines } from "../test/hunk-lines";
import { fileKey, numberIn, numbered, numberingOf, numberings } from "./numbering";
import type { CommentedFile, Numbering } from "./numbering";

type Diff = RpcOutput<typeof diffRpc>;

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

// A diff that can't be read.
function unread(): Pick<Diff, "hunks"> | undefined {
  return undefined;
}

// What the numbering gives each number up to a few past the lines the diff numbers.
function mapped(numbering: Numbering | undefined) {
  return (["old", "new"] as const).map((side) =>
    Array.from({ length: 12 }, (_, at) => numbering?.[side](at + 1)),
  );
}

test("a partly staged file's diff is numbered by its other diff once that's read, the same each time, and any other file's as its diffs number it, once the groups are listed", () => {
  fc.assert(
    fc.property(file, diffHunks, ({ diff, path }, { diff: other }) => {
      const read = numberings([path], () => other);
      const numbering = read({ diff, path });

      expect(mapped(numbering)).toStrictEqual(mapped(numberingOf(diff, other)));
      expect(read({ diff, path })).toBe(numbering);
      expect(mapped(read({ diff, path: `${path}/other` }))).toStrictEqual(mapped(asNumbered));
      expect(numberings([path], unread)({ diff, path })).toBeUndefined();
      expect(numberings(undefined, () => other)({ diff, path })).toBeUndefined();
    }),
  );
});

function oneLine(kind: "added" | "removed") {
  return { kind, text: "x", newline: true, runs: [] };
}

// A partly staged file's diffs: the index adds a line before HEAD's, and the worktree removes the
// index's second.
const staged = { hunks: [{ oldStart: 0, newStart: 1, lines: [oneLine("added")] }] };
const unstaged = { hunks: [{ oldStart: 2, newStart: 1, lines: [oneLine("removed")] }] };

function partlyStagedDiff({ diff }: CommentedFile): Pick<Diff, "hunks"> | undefined {
  return new Map([
    ["staged", staged],
    ["unstaged", unstaged],
  ]).get(diff);
}

test("a partly staged file's diffs are each numbered by the other", () => {
  const read = numberings(["a.txt"], partlyStagedDiff);

  expect(mapped(read({ diff: "unstaged", path: "a.txt" }))).toStrictEqual(
    mapped(numberingOf("unstaged", staged)),
  );
  expect(mapped(read({ diff: "staged", path: "a.txt" }))).toStrictEqual(
    mapped(numberingOf("staged", unstaged)),
  );
});
