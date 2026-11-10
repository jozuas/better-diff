import type { RpcOutput } from "@getpaseo/plugin";
import { expect, test } from "vitest";

import type { diffRpc } from "../shared/diff";
import { reviewOf } from "./attachment";
import type { CommentTarget } from "./comments";
import type { CommentedFile } from "./numbering";

type Diff = RpcOutput<typeof diffRpc>;

type Hunk = Diff["hunks"][number];

const file = { path: "a.txt" };

// The diffs of a file with changes only in its unstaged diff.
function unstagedOnly(diff: Pick<Diff, "hunks">) {
  return (each: CommentedFile) => (each.diff === "unstaged" ? diff : { hunks: [] });
}

// What a comment on the target is sent with, as a review of the diff sends it, if the diff has its
// line.
function contextOf(diff: Pick<Diff, "hunks">, target: CommentTarget) {
  return reviewOf("/repository", [{ ...target, id: 1, body: "" }], unstagedOnly(diff)).attachment
    ?.comments[0]?.context;
}

// A hunk of unchanged lines, from line 1 of each version, saying their numbers.
const unchangedHunk: Hunk = {
  oldStart: 1,
  newStart: 1,
  lines: Array.from({ length: 14 }, (_, at) => ({
    kind: "context" as const,
    text: String(at + 1),
    newline: true,
    runs: [],
  })),
};

// The texts of the lines a comment on the target in the hunk is sent with, and the one marked.
function sentLines(target: CommentTarget) {
  const context = contextOf({ hunks: [unchangedHunk] }, target);

  return {
    lines: context?.lines.map(({ content }) => content),
    target: context?.targetLine.content,
  };
}

test("a comment on several lines is sent with all of them, and up to three lines either side, and on the last", () => {
  const last: CommentTarget = { ...file, side: "new", line: 8 };

  expect(sentLines({ ...last, start: { side: "new", line: 5 } })).toStrictEqual({
    lines: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
    target: "8",
  });
  expect(sentLines({ ...last, start: { side: "old", line: 2 } }).lines?.[0]).toBe("1");
});

test("a comment on several lines whose first its hunk hasn't before the last is sent with the lines around the last", () => {
  const last: CommentTarget = { ...file, side: "new", line: 8 };
  const around = ["5", "6", "7", "8", "9", "10", "11"];

  expect(sentLines({ ...last, start: { side: "new", line: 20 } }).lines).toStrictEqual(around);
  expect(sentLines({ ...last, start: { side: "new", line: 12 } }).lines).toStrictEqual(around);
  expect(sentLines({ ...last, start: { side: "new", line: 8 } }).lines).toStrictEqual(around);
});

test("a comment on several lines is sent saying which they are, before what it says", () => {
  const sent = reviewOf(
    "/repository",
    [{ ...file, side: "new", line: 8, start: { side: "new", line: 5 }, id: 1, body: "Why?\nAnd?" }],
    unstagedOnly({ hunks: [unchangedHunk] }),
  ).attachment?.comments[0];

  expect(sent).toMatchObject({ side: "new", lineNumber: 8, body: "Lines 5\u20138: Why?\nAnd?" });
});
