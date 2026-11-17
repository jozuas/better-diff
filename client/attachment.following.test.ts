import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { diffRpc } from "../shared/diff";
import { rewritten } from "../test/comments";
import { reviewOf } from "./attachment";
import type { ReviewComment } from "./comments";
import type { CommentedFile } from "./numbering";

type Diff = RpcOutput<typeof diffRpc>;

type Rewritten = typeof rewritten extends fc.Arbitrary<infer Files> ? Files : never;

type File = Rewritten["after"];

function contentsOf(lines: readonly string[]): Diff["contents"] {
  return lines.map((text) => ({ text, runs: [] }));
}

// The file's diffs, read with every line of the versions they go to: the worktree, for the unstaged
// one, and the index, for the staged one.
function readOf({ versions, diffs }: File) {
  return ({ diff }: CommentedFile) =>
    diff === "unstaged"
      ? { ...diffs.unstaged, contents: contentsOf(versions.worktree) }
      : { ...diffs.staged, contents: contentsOf(versions.index) };
}

// A comment on the line at the index of the worktree's lines, with what tells it apart there.
function commentOn(worktree: readonly string[], index: number): ReviewComment {
  return {
    path: "a.txt",
    side: "new",
    line: index + 1,
    anchor: {
      text: worktree[index] ?? "",
      before: worktree.slice(Math.max(0, index - 3), index),
      after: worktree.slice(index + 1, index + 4),
    },
    id: 1,
    body: "",
  };
}

// What a review of a comment on the line picked of the worktree's lines sends of it once the
// worktree's changed, and what it's expected to: the comment on the line with its text, unless
// that's gone, when it isn't sent, as it's no longer in its diffs. Neither where the worktree has
// no lines.
function sentAndExpected({ before, after }: Rewritten, picked: number) {
  const { worktree } = before.versions;
  const at = picked % Math.max(1, worktree.length);
  const text = worktree[at];

  if (text === undefined) {
    return { sent: undefined, expected: undefined };
  }

  const review = reviewOf("/repository", [commentOn(worktree, at)], readOf(after));
  const now = after.versions.worktree.indexOf(text);

  return {
    sent: {
      on: review.attachment?.comments.map(({ side, lineNumber, context }) => [
        side,
        lineNumber,
        context.targetLine.content,
      ]),
      unsent: review.unsent,
    },
    expected:
      now === -1
        ? { on: undefined, unsent: ["gone"] }
        : { on: [["new", now + 1, text]], unsent: [] },
  };
}

test("a comment on a line of the worktree is sent on the line it's on once the worktree changes, as lines are added and removed around it, and not once it's removed, as it's no longer in its diffs", () => {
  fc.assert(
    fc.property(rewritten, fc.nat(), (files, picked) => {
      const { sent, expected } = sentAndExpected(files, picked);

      expect(sent).toStrictEqual(expected);
    }),
  );
});
