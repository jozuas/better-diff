import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { diffRpc } from "../shared/diff";
import { asNumbered, commentTarget, diffHunks, reviewComments } from "../test/comments";
import { reviewOf, reviewedDiffs } from "./attachment";
import type { ReviewAttachment, Unsent } from "./attachment";
import { rangeLabel, targetOf } from "./comments";
import type { CommentTarget, ReviewComment } from "./comments";
import type { NumberedLine } from "./lines";
import type { CommentedFile } from "./numbering";
import { shows } from "./side-by-side";
import type { Side } from "./side-by-side";

type Diff = RpcOutput<typeof diffRpc>;

type Hunk = Diff["hunks"][number];

const file = { path: "a.txt" };

// The file, where its other diff changes nothing, so that the review numbers its lines as its diff
// does.
function numberedFile(path: string) {
  return { path, numbering: asNumbered };
}

// A diff that changes nothing, as the file's other diff does unless it's partly staged.
const unchanged = { hunks: [] };

// The diffs of a file that has changes only on the diff's side.
function onlyIn(diff: Pick<Diff, "hunks">, side: CommentedFile["diff"]) {
  return (each: CommentedFile) => (each.diff === side ? diff : unchanged);
}

// What a comment on the target is sent with, as a review of the diff, unstaged or else staged, sends
// it, if the diff has its line, where the file's other diff changes nothing.
function contextOf(
  diff: Pick<Diff, "hunks">,
  target: CommentTarget,
  side: CommentedFile["diff"] = "unstaged",
) {
  return reviewOf("/repository", [{ ...target, id: 1, body: "" }], onlyIn(diff, side)).attachment
    ?.comments[0]?.context;
}

// The header a comment on the target in the hunk is sent with.
function headerOf(hunk: Hunk, target: CommentTarget): string | undefined {
  return contextOf({ hunks: [hunk] }, target)?.hunkHeader;
}

function linesOf(kinds: NumberedLine["kind"][]) {
  return kinds.map((kind) => ({ kind, text: "", newline: true, runs: [] }));
}

test("a comment is sent with its hunk's header as git writes it, without a count of one", () => {
  expect(
    headerOf(
      { oldStart: 4, newStart: 4, lines: linesOf(["context", "removed", "added"]) },
      { ...file, side: "new", line: 4 },
    ),
  ).toBe("@@ -4,2 +4,2 @@");
  expect(
    headerOf(
      { oldStart: 0, newStart: 1, lines: linesOf(["added"]) },
      { ...file, side: "new", line: 1 },
    ),
  ).toBe("@@ -0,0 +1 @@");
  expect(
    headerOf(
      { oldStart: 1, newStart: 0, lines: linesOf(["removed", "removed"]) },
      { ...file, side: "old", line: 2 },
    ),
  ).toBe("@@ -1,2 +0,0 @@");
  expect(
    headerOf(
      { oldStart: 12, newStart: 10, lines: linesOf(["context"]) },
      { ...file, side: "old", line: 12 },
    ),
  ).toBe("@@ -12 +10 @@");
});

const sides = fc.constantFrom<Side | undefined>(undefined, "old", "new");

// How many lines before and after the line commented on it's sent with, and the line.
interface SentWith {
  before: number;
  after: number;
  line: string | undefined;
}

// What a comment on each of the hunk's lines the side shows, or inline, is sent with, or that the
// lines sent with it aren't the hunk's, one after another.
function sentWith(
  diff: Diff,
  lines: readonly NumberedLine[],
  side: Side | undefined,
): (SentWith | "not the hunk's lines")[] {
  return lines.flatMap((line, at): (SentWith | "not the hunk's lines")[] => {
    const target = targetOf(numberedFile(file.path), line, side);

    if (target === undefined) {
      return [];
    }

    const context = contextOf(diff, target);
    const texts = context?.lines.map(({ content }) => content) ?? [];
    const first = lines.findIndex(({ text }) => text === texts[0]);
    const hunks = lines.slice(first, first + texts.length).map(({ text }) => text);

    return JSON.stringify(hunks) === JSON.stringify(texts)
      ? [
          {
            before: at - first,
            after: first + texts.length - 1 - at,
            line: context?.targetLine.content,
          },
        ]
      : ["not the hunk's lines"];
  });
}

// Each line the side shows of the hunk, or inline, sent with up to three lines of its hunk either
// side.
function sentAround(lines: readonly NumberedLine[], side: Side | undefined): SentWith[] {
  return lines.flatMap((line, at) =>
    shows(side, line.kind)
      ? [{ before: Math.min(3, at), after: Math.min(3, lines.length - 1 - at), line: line.text }]
      : [],
  );
}

test("a comment is sent with the lines of its hunk around it, up to three either side, as Paseo's own diff sends them", () => {
  fc.assert(
    fc.property(diffHunks, sides, ({ diff, numbered }, side) => {
      expect(numbered.map((lines) => sentWith(diff, lines, side))).toStrictEqual(
        numbered.map((lines) => sentAround(lines, side)),
      );
    }),
  );
});

test("a line is sent with its numbers in each version it's in, and whether it's unchanged, removed or added", () => {
  const diff: Diff = {
    version: "version",
    kind: "text",
    added: 1,
    removed: 1,
    hunks: [
      {
        oldStart: 7,
        newStart: 7,
        lines: [
          { kind: "context", text: "kept", newline: true, runs: [] },
          { kind: "removed", text: "old\r", newline: true, runs: [] },
          { kind: "added", text: "\tnew é", newline: false, runs: [] },
        ],
      },
    ],
    contents: [],
  };

  expect(contextOf(diff, { ...file, side: "new", line: 8 })).toStrictEqual({
    hunkHeader: "@@ -7,2 +7,2 @@",
    targetLine: { oldLineNumber: null, newLineNumber: 8, type: "add", content: "\tnew é" },
    lines: [
      { oldLineNumber: 7, newLineNumber: 7, type: "context", content: "kept" },
      { oldLineNumber: 8, newLineNumber: null, type: "remove", content: "old\r" },
      { oldLineNumber: null, newLineNumber: 8, type: "add", content: "\tnew é" },
    ],
  });
});

// Whether some line of the hunks is on the target's side, at its number.
function hasLine(numbered: readonly NumberedLine[][], target: CommentTarget): boolean {
  return numbered.some((lines) =>
    lines.some(
      (line) => targetOf(numberedFile(target.path), line, target.side)?.line === target.line,
    ),
  );
}

test("a comment on a line its diff doesn't have has nothing to send it with", () => {
  fc.assert(
    fc.property(diffHunks, commentTarget, ({ diff, numbered }, target) => {
      expect(contextOf(diff, target) !== undefined).toBe(hasLine(numbered, target));
    }),
  );
});

// What a comment is sent saying: what it says, after which lines it's on, for one on several.
function sentBody(comment: ReviewComment): string {
  const lines = rangeLabel(comment);

  return lines === undefined ? comment.body : `${lines}: ${comment.body}`;
}

type Diffs = (path: string) => { diff: Diff } | undefined;

// What the review does with each comment, by the diffs on the side, and whether each file's other
// diff, which changes nothing, can be read: sends those on lines their diffs have, with the lines
// around them, and says why it doesn't send the others.
function reviewed(
  comments: readonly ReviewComment[],
  side: CommentedFile["diff"],
  diffs: Diffs,
  read: (path: string) => boolean,
): ({ comment: ReviewComment } & (
  | { sent: ReviewAttachment["comments"][number] }
  | { unsent: Unsent }
))[] {
  return comments.map((comment) => {
    const diff = diffs(comment.path)?.diff;

    if (diff === undefined || !read(comment.path)) {
      return { comment, unsent: "unread" };
    }

    const context = contextOf(diff, comment, side);

    return context === undefined
      ? { comment, unsent: "gone" }
      : {
          comment,
          sent: {
            filePath: comment.path,
            side: comment.side,
            lineNumber: comment.line,
            body: sentBody(comment),
            context,
          },
        };
  });
}

// The diffs of each file: on the side, those generated, which can't be read where there's none, and
// on the other, one that changes nothing, where it can be read.
function diffsOn(side: CommentedFile["diff"], diffs: Diffs, read: (path: string) => boolean) {
  return ({ diff, path }: CommentedFile) => {
    if (diff === side) {
      return diffs(path)?.diff;
    }

    return read(path) ? unchanged : undefined;
  };
}

// Each of the reviewed that's sent, or why each of the others isn't.
function sentOf(expected: ReturnType<typeof reviewed>) {
  return expected.flatMap((each) => ("sent" in each ? [each] : []));
}

// The comments an attachment has, or none without one.
function attachedOf({ attachment }: ReturnType<typeof reviewOf>): ReviewAttachment["comments"] {
  return attachment?.comments ?? [];
}

function unsentOf(expected: ReturnType<typeof reviewed>): Unsent[] {
  return expected.flatMap((each) => ("unsent" in each ? [each.unsent] : []));
}

test("a review has the comments on lines their diffs have, in the order they were made, each with the lines around it, and says why it hasn't the others", () => {
  fc.assert(
    fc.property(
      reviewComments,
      fc.constantFrom("unstaged", "staged"),
      fc.func(fc.option(diffHunks, { nil: undefined })),
      fc.func(fc.boolean()),
      (comments, side, diffs, read) => {
        const review = reviewOf("/repository", comments, diffsOn(side, diffs, read));
        const expected = reviewed(comments, side, diffs, read);
        const sent = sentOf(expected);

        expect(review.sent).toStrictEqual(sent.map(({ comment }) => comment));
        expect(attachedOf(review)).toStrictEqual(sent.map((each) => each.sent));
        expect(review.unsent).toStrictEqual(unsentOf(expected));
      },
    ),
  );
});

test("a review is of the worktree's uncommitted changes, as Paseo's own diff sends it", () => {
  const diff: Diff = {
    version: "version",
    kind: "text",
    added: 1,
    removed: 0,
    hunks: [{ oldStart: 0, newStart: 1, lines: linesOf(["added"]) }],
    contents: [],
  };

  expect(
    reviewOf(
      "/repository",
      [{ ...file, side: "new", line: 1, id: 1, body: "Why?" }],
      onlyIn(diff, "unstaged"),
    ).attachment,
  ).toStrictEqual({
    type: "review",
    mimeType: "application/paseo-review",
    cwd: "/repository",
    mode: "uncommitted",
    baseRef: null,
    comments: [
      {
        filePath: "a.txt",
        side: "new",
        lineNumber: 1,
        body: "Why?",
        context: {
          hunkHeader: "@@ -0,0 +1 @@",
          targetLine: { oldLineNumber: null, newLineNumber: 1, type: "add", content: "" },
          lines: [{ oldLineNumber: null, newLineNumber: 1, type: "add", content: "" }],
        },
      },
    ],
  });
});

test("a review without a comment to send has no attachment", () => {
  expect(reviewOf("/repository", [], () => unchanged)).toStrictEqual({
    attachment: undefined,
    sent: [],
    unsent: [],
  });
});

test("the diffs a review reads are both diffs of each file comments are on, once each", () => {
  fc.assert(
    fc.property(reviewComments, (comments) => {
      const files = reviewedDiffs(comments);
      const keys = files.map(({ diff, path }) => JSON.stringify([diff, path]));
      const paths = new Set(comments.map(({ path }) => path));

      expect(new Set(keys).size).toBe(files.length);
      expect(new Set(keys)).toStrictEqual(
        new Set(
          [...paths].flatMap((path) => [
            JSON.stringify(["unstaged", path]),
            JSON.stringify(["staged", path]),
          ]),
        ),
      );
      expect(files.every((each) => Object.keys(each).length === 2)).toBe(true);
    }),
  );
});
