import type { RpcOutput } from "@getpaseo/plugin";
import { expect, test } from "vitest";

import type { diffRpc } from "../shared/diff";
import type { Versions } from "./anchors";
import { threadsOf } from "./comments";
import type { Editing, ReviewComment } from "./comments";
import { fileKey } from "./numbering";
import type { CommentedFile } from "./numbering";
import {
  commentedPaths,
  commentsByPath,
  keptPaths,
  threadsByPath,
  versionsByPath,
  writtenNowhere,
} from "./placing";

type Diff = RpcOutput<typeof diffRpc>;

// A comment on the line at the index of the lines of the worktree, with what tells it apart there.
function commentOn(lines: readonly string[], index: number, id = 1): ReviewComment {
  return {
    path: "a.txt",
    side: "new",
    line: index + 1,
    anchor: {
      text: lines[index] ?? "",
      before: lines.slice(Math.max(0, index - 3), index),
      after: lines.slice(index + 1, index + 4),
    },
    id,
    body: "",
  };
}

const lines = ["a", "b", "c", "d"];

// The file's versions once a line's added before its first in the worktree.
const added: Versions = { old: lines, new: ["new", ...lines] };

test("the files commented on are those of the comments, and of the one being written", () => {
  const onB = { ...commentOn(lines, 0), path: "b.txt" };
  const editing: Editing = { target: { ...onB, path: "c.txt" }, id: undefined, where: "line" };

  expect(commentedPaths([commentOn(lines, 0), onB], editing)).toStrictEqual([
    "a.txt",
    "b.txt",
    "c.txt",
  ]);
  expect(commentedPaths([onB])).toStrictEqual(["b.txt"]);
});

test("each file commented on is listed once, however many comments are on it, and the one being written is", () => {
  const onA = commentOn(lines, 0);
  const editing: Editing = { target: onA, id: undefined, where: "line" };

  expect(commentedPaths([onA, commentOn(lines, 1, 2)], editing)).toStrictEqual(["a.txt"]);
});

test("the paths kept stay while the paths now are the same ones, in whatever order, and else the paths now are", () => {
  const kept = ["a.txt", "b.txt"];

  expect(keptPaths(kept, ["b.txt", "a.txt"])).toBe(kept);
  expect(keptPaths(kept, ["a.txt", "b.txt"])).toBe(kept);

  for (const now of [["a.txt"], ["a.txt", "c.txt"], ["a.txt", "b.txt", "c.txt"], []]) {
    expect(keptPaths(kept, now)).toBe(now);
  }
});

function contentsOf(texts: readonly string[]): Diff["contents"] {
  return texts.map((text) => ({ text, runs: [] }));
}

// A file's diff adding a line before the lines, read with every line of the version it goes to.
const addingOne: Pick<Diff, "hunks" | "contents"> = {
  hunks: [
    {
      oldStart: 0,
      newStart: 1,
      lines: [{ kind: "added", text: "new", newline: true, runs: [] }],
    },
  ],
  contents: contentsOf(["new", ...lines]),
};

const unchanged = { hunks: [], contents: [] };

// The diffs read: both of `a.txt`'s, the unstaged one adding a line before its others, and only the
// unstaged one of `b.txt`'s.
const read = new Map([
  [fileKey({ diff: "unstaged", path: "a.txt" }), addingOne],
  [fileKey({ diff: "staged", path: "a.txt" }), unchanged],
  [fileKey({ diff: "unstaged", path: "b.txt" }), addingOne],
]);

function diffOf(file: CommentedFile): Pick<Diff, "hunks" | "contents"> | undefined {
  return read.get(fileKey(file));
}

test("a file's versions are known once both its diffs are read", () => {
  expect(versionsByPath(["a.txt", "b.txt"], diffOf)).toStrictEqual(new Map([["a.txt", added]]));
});

// What shows under the lines of each file's diffs, of the comments pending and the one being
// written, if any, in the versions of the files, by path.
function shownIn(
  comments: readonly ReviewComment[],
  written: Editing | undefined,
  versions: ReadonlyMap<string, Versions>,
) {
  return commentsByPath(threadsByPath(comments, versions), written, versions);
}

test("the comments on a file show under the lines theirs are in its versions, and not while those aren't known, or their lines are removed", () => {
  const onB = commentOn(lines, 1);
  const onD = commentOn(lines, 3, 2);
  const gone = { ...commentOn(["x", "y"], 1, 3) };
  const elsewhere = { ...commentOn(lines, 1, 4), path: "b.txt" };
  const shown = shownIn([onB, onD, gone, elsewhere], undefined, new Map([["a.txt", added]]));

  expect(shown("a.txt")).toStrictEqual({
    threads: threadsOf([
      { ...onB, line: 3 },
      { ...onD, line: 5 },
    ]),
    editing: undefined,
  });
  expect(shown("b.txt")).toStrictEqual({ threads: new Map(), editing: undefined });
});

const target = commentOn(lines, 1);
const editing: Editing = { target, id: undefined, where: "line" };

// What shows under the lines of `a.txt`'s diffs, of what's being written, in the versions.
function writtenIn(versions: Versions, written: Editing = editing) {
  return shownIn([], written, new Map([["a.txt", versions]]));
}

test("the comment being written shows under the line its line is in its file's versions, and under none while it's removed", () => {
  expect(writtenIn(added)("a.txt").editing).toStrictEqual({
    ...editing,
    target: { ...target, line: 3 },
  });
  expect(writtenIn({ ...added, new: lines })("a.txt").editing).toBe(editing);
  expect(writtenIn({ ...added, new: ["a"] })("a.txt").editing).toBeUndefined();
  expect(writtenIn(added)("b.txt").editing).toBeUndefined();
});

test("the comment being written shows under the line it was started on while its file's versions aren't known", () => {
  const unknown = shownIn([], editing, new Map());

  expect(unknown("a.txt")).toStrictEqual({ threads: new Map(), editing });
  expect(unknown("a.txt").editing).toBe(editing);
});

const removed = { ...added, new: ["a"] };
const edit: Editing = { target, id: 1, where: "line" };

test("what's being written under a line shows under none while its line is removed from its file's versions, a new comment or an edit of one saved", () => {
  expect(writtenNowhere(editing, writtenIn(removed))).toBe("comment");
  expect(writtenNowhere(edit, writtenIn(removed, edit))).toBe("edit");
});

test("what's being written under a line shows under none not while its line is in its file's versions, nor while they aren't known, nor while it's written in the review's list", () => {
  const inList: Editing = { ...edit, where: "list" };

  expect(writtenNowhere(editing, writtenIn(added))).toBeUndefined();
  expect(writtenNowhere(edit, writtenIn(added, edit))).toBeUndefined();
  expect(writtenNowhere(editing, shownIn([], editing, new Map()))).toBeUndefined();
  expect(writtenNowhere(inList, writtenIn(removed, inList))).toBeUndefined();
  expect(writtenNowhere(undefined, writtenIn(removed))).toBeUndefined();
});

test("what shows under a file's lines, and the comments pending on it, are the same each time they're asked for", () => {
  const versions = new Map([["a.txt", added]]);
  const threadsIn = threadsByPath([commentOn(lines, 1)], versions);
  const shown = commentsByPath(threadsIn, undefined, versions);

  expect(threadsIn("a.txt")).toBe(threadsIn("a.txt"));
  expect(shown("a.txt")).toBe(shown("a.txt"));
});

test("the comments pending on a file are placed once, whatever's being written", () => {
  const versions = new Map([["a.txt", added]]);
  const threadsIn = threadsByPath([commentOn(lines, 1)], versions);

  for (const written of [undefined, editing, { ...editing, target: commentOn(lines, 3, 2) }]) {
    expect(commentsByPath(threadsIn, written, versions)("a.txt").threads).toBe(threadsIn("a.txt"));
  }
});
