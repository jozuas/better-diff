import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { diffRpc } from "../shared/diff";
import { groupName } from "../test/changes";
import { diffHunks, reviewComments } from "../test/comments";
import type { ReviewComment } from "./comments";
import type { NumberedLine } from "./lines";
import type { CommentedFile } from "./numbering";
import {
  lineLabel,
  lineNote,
  lineNumberOf,
  openFileOf,
  partlyStaged,
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

// The lines of the hunks of the file's diff that changes it, if it can be read.
function numberedIn(diffs: Diffs, path: string): NumberedLine[][] | undefined {
  return diffs(path).read?.numbered;
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

// Where the comment's line is, as the diff of its file that changes it, if it can be read, has it:
// the line and the diff, or that it's gone, or unread.
function expectedPlace(diffs: Diffs, comment: ReviewComment): Placed {
  const numbered = numberedIn(diffs, comment.path);
  const place = numbered === undefined ? undefined : placeIn(numbered, comment);
  const line = place === undefined ? undefined : numbered?.[place[0]]?.[place[1]];

  if (line === undefined) {
    return numbered === undefined ? "unread" : "gone";
  }

  return { line, diff: diffs(comment.path).side };
}

// Whether the file's comments are in the order of their lines in its diff, comments on one line in
// the order they were made, and those whose lines it hasn't after them, in the order they were made.
function inOrder(
  diffs: Diffs,
  comments: readonly ReviewComment[],
  { comments: listed }: ListedFile,
): boolean {
  const orders = listed.map(({ comment }) => {
    const place = placeIn(numberedIn(diffs, comment.path) ?? [], comment) ?? [Infinity, 0];

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

// Whether the files are each by path, each once.
function filesInOrder(files: readonly ListedFile[]): boolean {
  return files.every(({ path }, at) => {
    const previous = files[at - 1]?.path;

    return previous === undefined || previous < path;
  });
}

test("the review lists each file commented on once, each by path, with the comments on it", () => {
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
        files.every(({ path, comments: listed }) =>
          listed.every(({ comment }) => comment.path === path),
        ),
      ).toBe(true);
    }),
  );
});

test("each comment's listed with its line as the diff that has it has it, or as gone from its diffs, or as unread, in the order of the lines", () => {
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

// A hunk of the lines, each added, or unchanged where it starts with a space.
function hunkOf(oldStart: number, newStart: number, written: readonly string[]) {
  return {
    oldStart,
    newStart,
    lines: written.map((text) => ({
      kind: text.startsWith(" ") ? ("context" as const) : ("added" as const),
      text: text.trim(),
      newline: true,
      runs: [],
    })),
  };
}

test("a file's comments in one of its diffs are listed in the order of its hunks, and of their lines in each", () => {
  // HEAD has four lines, and the worktree x and y before them, and z after them.
  const diffs: Record<CommentedFile["diff"], Pick<Diff, "hunks">> = {
    staged: { hunks: [] },
    unstaged: { hunks: [hunkOf(0, 1, ["x", "y"]), hunkOf(4, 7, ["z"])] },
  };

  const onZ = { path: "a.txt", side: "new", line: 7, id: 1, body: "" } as const;
  const onY = { ...onZ, line: 2, id: 2 };
  const onX = { ...onZ, line: 1, id: 3 };

  expect(reviewList([onZ, onY, onX], ({ diff }) => diffs[diff])).toMatchObject([
    { comments: [{ comment: onX }, { comment: onY }, { comment: onZ }] },
  ]);
});

test("a file's comments are listed in the order of their lines in its unstaged diff and then its staged one, those on staged lines saying so", () => {
  // HEAD hasn't the file, the index has s, and the worktree s and then u.
  const diffs: Record<CommentedFile["diff"], Pick<Diff, "hunks">> = {
    staged: { hunks: [hunkOf(0, 1, ["s"])] },
    unstaged: { hunks: [hunkOf(1, 1, [" s", "u"])] },
  };

  const onS = { path: "a.txt", side: "new", line: 1, id: 1, body: "" } as const;
  const onU = { ...onS, line: 2, id: 2 };
  const files = reviewList([onS, onU], ({ diff }) => diffs[diff]);

  expect(files).toMatchObject([
    {
      path: "a.txt",
      comments: [
        { comment: onU, placed: { diff: "unstaged", line: { text: "u" } } },
        { comment: onS, placed: { diff: "staged", line: { text: "s" } } },
      ],
    },
  ]);
  expect(files.flatMap(({ comments }) => comments.map(lineLabel))).toStrictEqual([
    "+2",
    "+1 staged",
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

test("a file's row counts the comments pending on the file, whichever of its diffs has their lines", () => {
  fc.assert(
    fc.property(
      reviewComments,
      groupName,
      fc.constantFrom("a.txt", "b.txt"),
      (comments, group, path) => {
        expect(pendingOn(pendingCounts(comments), { group, path })).toBe(
          comments.filter((comment) => comment.path === path).length,
        );
      },
    ),
  );
});

test("the files partly staged are those both MODIFIED and STAGED list", () => {
  fc.assert(
    fc.property(
      fc.record({
        modified: fc.uniqueArray(fc.constantFrom("a", "b", "c", "d")),
        untracked: fc.uniqueArray(fc.constantFrom("a", "b", "c", "d")),
        staged: fc.uniqueArray(fc.constantFrom("a", "b", "c", "d")),
      }),
      (listed) => {
        expect(new Set(partlyStaged(listed))).toStrictEqual(
          new Set(listed.modified.filter((path) => listed.staged.includes(path))),
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

const comment = { path: "a.txt", side: "old", line: 7, id: 1, body: "" } as const;

// The comment is on line 7 of HEAD, and the line is numbered 2 in the old version of the diff that
// has it, as a partly staged file's unstaged diff numbers HEAD's lines as the index does.
const placings: [Placed, string, string][] = [
  [{ line, diff: "unstaged" }, "2", "\tkept é"],
  [{ line: { ...line, kind: "removed" }, diff: "unstaged" }, "\u22122", "\tkept é"],
  [{ line: { ...line, kind: "added" }, diff: "staged" }, "+2 staged", "\tkept é"],
  ["gone", "7", "No longer in its diffs"],
  ["unread", "7", ""],
];

test.each(placings)(
  "a comment's line in the review is labelled with its number where it's shown, marked as removed, added or neither, and as staged, or else the review's, and shown, or as gone or not yet read: %o",
  (placed, label, note) => {
    expect(lineLabel({ comment, placed })).toBe(label);
    expect(String(lineNumberOf({ comment, placed }))).toBe(label.replaceAll(/\D+/gu, ""));
    expect(lineNote(placed)).toBe(note);
  },
);

test("a file's row says how many comments are pending on it", () => {
  expect(pendingLabel(1)).toBe("1 pending comment");
  expect(pendingLabel(2)).toBe("2 pending comments");
});
