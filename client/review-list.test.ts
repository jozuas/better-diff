import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { diffRpc } from "../shared/diff";
import { groupName } from "../test/changes";
import { diffHunks, reviewComments } from "../test/comments";
import type { CommentedFile, ReviewComment } from "./comments";
import { groups } from "./groups";
import type { NumberedLine } from "./lines";
import {
  fileHeading,
  lineMark,
  lineNote,
  openFileOf,
  pendingCounts,
  pendingLabel,
  pendingOn,
  reviewList,
} from "./review-list";
import type { ListedFile, Placed } from "./review-list";

type Diff = RpcOutput<typeof diffRpc>;

// Each file's diffs: on the side, the one generated, and on the other one that changes nothing, or
// neither, where they can't be read.
type Diffs = (path: string) => {
  side: CommentedFile["diff"];
  read: { diff: Diff; numbered: NumberedLine[][] } | undefined;
};

const fileDiffs = fc.func(
  fc.record({
    side: fc.constantFrom("unstaged", "staged"),
    read: fc.option(diffHunks, { nil: undefined }),
  }),
);

// The file's diff, as the generated diffs have it, if it can be read.
function diffIn(diffs: Diffs): (file: CommentedFile) => Pick<Diff, "hunks"> | undefined {
  return ({ diff, path }) => {
    const { side, read } = diffs(path);

    return diff === side ? read?.diff : read && { hunks: [] };
  };
}

// The lines of the hunks of the file's diff, if it can be read.
function numberedIn(diffs: Diffs, { diff, path }: CommentedFile): NumberedLine[][] | undefined {
  const { side, read } = diffs(path);

  return diff === side ? read?.numbered : read && [];
}

function sameFile(file: CommentedFile, other: CommentedFile): boolean {
  return file.diff === other.diff && file.path === other.path;
}

// Where the comment's line is in the hunks, by the hunk's index and its own in it, if they have it.
function placeIn(
  numbered: readonly NumberedLine[][],
  comment: ReviewComment,
): [number, number] | undefined {
  for (const [hunk, lines] of numbered.entries()) {
    const at = lines.findIndex(
      (line) => (comment.side === "old" ? line.oldNumber : line.newNumber) === comment.line,
    );

    if (at !== -1) {
      return [hunk, at];
    }
  }

  return undefined;
}

// Where the comment's line is, as the diff its file has, if any, has it: the line, or that it's gone,
// or unread.
function expectedPlace(diffs: Diffs, comment: ReviewComment): Placed {
  const numbered = numberedIn(diffs, comment);
  const place = numbered === undefined ? undefined : placeIn(numbered, comment);
  const line = place === undefined ? undefined : numbered?.[place[0]]?.[place[1]];

  if (line === undefined) {
    return numbered === undefined ? "unread" : "gone";
  }

  return { line, changed: false };
}

// Whether the file's comments are in the order of their lines in its diff, comments on one line in
// the order they were made, and those whose lines it hasn't after them, in the order they were made.
function inOrder(
  diffs: Diffs,
  comments: readonly ReviewComment[],
  { comments: listed }: ListedFile,
): boolean {
  const orders = listed.map(({ comment }) => {
    const place = placeIn(numberedIn(diffs, comment) ?? [], comment) ?? [Infinity, 0];

    return [...place, comments.indexOf(comment)];
  });

  return orders.every((order, at) => {
    const previous = orders[at - 1];

    return (
      previous === undefined ||
      (previous[0] ?? 0) < (order[0] ?? 0) ||
      (previous[0] === order[0] &&
        ((previous[1] ?? 0) < (order[1] ?? 0) ||
          (previous[1] === order[1] && (previous[2] ?? 0) < (order[2] ?? 0))))
    );
  });
}

// Whether the files are unstaged ones before staged ones, and each by path, each once.
function filesInOrder(files: readonly ListedFile[]): boolean {
  return files.every(({ file }, at) => {
    const previous = files[at - 1]?.file;

    return (
      previous === undefined ||
      (previous.diff === "unstaged" && file.diff === "staged") ||
      (previous.diff === file.diff && previous.path < file.path)
    );
  });
}

test("the review lists each file commented on once, unstaged before staged, each by path, with the comments on it", () => {
  fc.assert(
    fc.property(reviewComments, fileDiffs, (comments, diffs) => {
      const files = reviewList(comments, diffIn(diffs));

      expect(filesInOrder(files)).toBe(true);
      expect(
        files
          .flatMap(({ comments: listed }) => listed.map(({ comment }) => comment.id))
          .toSorted((a, b) => a - b),
      ).toStrictEqual(comments.map(({ id }) => id).toSorted((a, b) => a - b));
      expect(
        files.every(({ file, comments: listed }) =>
          listed.every(({ comment }) => sameFile(file, comment)),
        ),
      ).toBe(true);
    }),
  );
});

test("each comment's listed with its line as its diff has it, or as gone from it, or as unread, in the order of the lines", () => {
  fc.assert(
    fc.property(reviewComments, fileDiffs, (comments, diffs) => {
      const files = reviewList(comments, diffIn(diffs));

      expect(files.flatMap((file) => file.comments.map(({ placed }) => placed))).toStrictEqual(
        files.flatMap((file) => file.comments.map(({ comment }) => expectedPlace(diffs, comment))),
      );
      expect(files.every((file) => inOrder(diffs, comments, file))).toBe(true);
    }),
  );
});

// A diff of one line, x, of the kind.
function oneLine(kind: NumberedLine["kind"]): Pick<Diff, "hunks"> {
  const start = { oldStart: kind === "added" ? 0 : 1, newStart: kind === "removed" ? 0 : 1 };

  return { hunks: [{ ...start, lines: [{ kind, text: "x", newline: true, runs: [] }] }] };
}

// The diffs of a file whose index adds x, which the worktree removes, if its unstaged diff can be
// read.
function restaged(unstagedRead: boolean) {
  return ({ diff }: CommentedFile) => {
    if (diff === "staged") {
      return oneLine("added");
    }

    return unstagedRead ? oneLine("removed") : undefined;
  };
}

test("a comment on a line only the index has, staged and then changed in the worktree, is listed as changed since it was staged", () => {
  const comment = { diff: "staged", path: "a.txt", side: "new", line: 1, id: 1, body: "" } as const;

  expect(reviewList([comment], restaged(true))[0]?.comments).toMatchObject([
    { comment, placed: { line: { text: "x" }, changed: true } },
  ]);
  expect(reviewList([comment], restaged(false))[0]?.comments).toMatchObject([
    { comment, placed: { line: { text: "x" }, changed: false } },
  ]);
});

test("a comment's file opens from the group that lists it: a staged one's from STAGED, an unstaged one's from MODIFIED or else UNTRACKED", () => {
  const listed = { modified: ["m.txt"], untracked: ["u.txt"], staged: ["m.txt", "s.txt"] };

  expect(openFileOf({ diff: "staged", path: "m.txt" }, listed)).toStrictEqual({
    group: "staged",
    path: "m.txt",
  });
  expect(openFileOf({ diff: "unstaged", path: "m.txt" }, listed)).toStrictEqual({
    group: "modified",
    path: "m.txt",
  });
  expect(openFileOf({ diff: "unstaged", path: "u.txt" }, listed)).toStrictEqual({
    group: "untracked",
    path: "u.txt",
  });
  expect(openFileOf({ diff: "staged", path: "u.txt" }, listed)).toBeUndefined();
  expect(openFileOf({ diff: "unstaged", path: "s.txt" }, listed)).toBeUndefined();
});

// How many of the comments are on the file's diff.
function countOn(
  comments: readonly ReviewComment[],
  diff: CommentedFile["diff"],
  path: string,
): number {
  return comments.filter((comment) => sameFile(comment, { diff, path })).length;
}

test("a file's row counts the comments pending on the diff its group shows", () => {
  fc.assert(
    fc.property(
      reviewComments,
      groupName,
      fc.constantFrom("a.txt", "b.txt"),
      (comments, group, path) => {
        expect(pendingOn(pendingCounts(comments), { group, path })).toBe(
          countOn(comments, groups[group].side, path),
        );
      },
    ),
  );
});

const line: NumberedLine = {
  kind: "context",
  text: "\tkept é",
  newline: true,
  runs: [],
  oldNumber: 2,
  newNumber: 3,
};

const placings: [Placed, string, string][] = [
  [{ line, changed: false }, "", "\tkept é"],
  [{ line: { ...line, kind: "removed" }, changed: false }, "−", "\tkept é"],
  [{ line: { ...line, kind: "added" }, changed: false }, "+", "\tkept é"],
  [{ line: { ...line, kind: "added" }, changed: true }, "+", "Changed since it was staged"],
  ["gone", "", "No longer in its diff"],
  ["unread", "", ""],
];

test.each(placings)(
  "a comment's line in the review is marked and shown as removed, added or neither, or as changed since it was staged, gone or not yet read: %o",
  (placed, mark, note) => {
    expect(lineMark(placed)).toBe(mark);
    expect(lineNote(placed)).toBe(note);
  },
);

test("the review lists a file's comments under its path, saying whether they're on its staged changes", () => {
  expect(fileHeading({ diff: "unstaged", path: "a b.txt" })).toBe("a b.txt");
  expect(fileHeading({ diff: "staged", path: "a b.txt" })).toBe("a b.txt (staged)");
});

test("a file's row says how many comments are pending on it", () => {
  expect(pendingLabel(1)).toBe("1 pending comment");
  expect(pendingLabel(2)).toBe("2 pending comments");
});
