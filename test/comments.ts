import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";

import { saved } from "../client/comments";
import type { CommentTarget, Editing, NumberedFile, ReviewComment } from "../client/comments";
import { numberLines } from "../client/lines";
import type { NumberedLine } from "../client/lines";
import type { Numbering } from "../client/numbering";
import type { diffRpc } from "../shared/diff";
import { changedBy, review } from "../shared/review";
import type { ReviewChange } from "../shared/review";
import { filePath } from "./file-names";
import { hunkLines } from "./hunk-lines";

type Diff = RpcOutput<typeof diffRpc>;

// How the review numbers the lines of a file whose diffs change nothing of each other's versions: as
// the diffs number them.
export const asNumbered: Numbering = { old: (number) => number, new: (number) => number };

// The whitespace git's --ignore-all-space ignores, as Hide whitespace does.
const gitWhitespace = new Set([" ", "\t", "\r", "\n"]);

// The text without that whitespace, as a version's lines are compared with what a comment's line
// was.
export function squeezed(text: string): string {
  return text
    .split("")
    .filter((character) => !gitWhitespace.has(character))
    .join("");
}

// What a diff whose file's other diff changes nothing is read with.
export const reviewed = { other: [] };

// The file at the path, whose diffs change nothing of each other's versions.
export function numberedFile(path: string): NumberedFile {
  return { path, numbering: asNumbered };
}

// Two paths, so that comments are often on the same file, or any path.
const path = fc.oneof(fc.constantFrom("a.txt", "b.txt"), filePath);

const lineOnSide = {
  side: fc.constantFrom("old", "new"),
  // Few lines, so that comments are often on the same line.
  line: fc.integer({ min: 1, max: 4 }),
} as const;

// A comment's lines: one, or several, from a first on either side.
const targetParts = {
  path,
  ...lineOnSide,
  start: fc.record(lineOnSide, { noNullPrototype: true }),
} as const;

export const commentTarget: fc.Arbitrary<CommentTarget> = fc.record(targetParts, {
  requiredKeys: ["path", "side", "line"],
  noNullPrototype: true,
});

// What a comment says: anything, newlines, `\r`, tabs and non-ASCII among it.
export const commentBody = fc.string({ unit: "binary", maxLength: 10 });

const reviewComment: fc.Arbitrary<ReviewComment> = fc.record(
  { ...targetParts, id: fc.integer({ min: 1, max: 20 }), body: commentBody },
  { requiredKeys: ["path", "side", "line", "id", "body"], noNullPrototype: true },
);

// What reads a comment as a review keeps it.
export const keptComment = review.shape.comments.element;

// A comment's id, few, so that changes are often of the same comment.
const commentId = fc.integer({ min: 1, max: 20 });

// Any change of a review, as a view makes it.
export const reviewChange: fc.Arbitrary<ReviewChange> = fc.oneof(
  reviewComment.map((comment): ReviewChange => ({ kind: "add", comment })),
  fc.record(
    { kind: fc.constant("edit" as const), id: commentId, body: commentBody, said: commentBody },
    { requiredKeys: ["kind", "id", "body"], noNullPrototype: true },
  ),
  fc.record({ kind: fc.constant("delete" as const), id: commentId }, { noNullPrototype: true }),
  fc.record(
    { kind: fc.constant("sent" as const), comments: fc.array(reviewComment, { maxLength: 3 }) },
    { noNullPrototype: true },
  ),
  fc.record(
    { kind: fc.constant("message" as const), text: commentBody, said: commentBody },
    { requiredKeys: ["kind", "text"], noNullPrototype: true },
  ),
  fc.record(
    {
      kind: fc.constant("restore" as const),
      comments: fc.array(reviewComment, { maxLength: 3 }),
      message: commentBody,
    },
    { noNullPrototype: true },
  ),
);

// Pending comments, each with an id of its own, in the order they were made, which is the order of
// their ids.
export const reviewComments = fc
  .uniqueArray(reviewComment, { selector: ({ id }) => id, maxLength: 8 })
  .map((comments) => comments.toSorted((comment, other) => comment.id - other.id));

// The comments once what's written is saved, as saving it changes them, and the comments themselves
// where it changes nothing.
export function savedIn(
  comments: readonly ReviewComment[],
  editing: Pick<Editing, "target" | "id" | "said">,
  text: string,
  pick?: () => number,
): readonly ReviewComment[] {
  const change = saved(comments, editing, text, pick);

  return change === undefined
    ? comments
    : changedBy({ comments: [...comments], message: "" }, [change]).comments;
}

// What a comment is but its id.
export function withoutId({ id: _id, ...comment }: ReviewComment): Omit<ReviewComment, "id"> {
  return comment;
}

// A diff's hunks, one after another in both versions, with an unchanged line or more between them,
// and the lines of each as the view numbers them. Each line has text no other line of its hunk has.
export const diffHunks: fc.Arbitrary<{ diff: Diff; numbered: NumberedLine[][] }> = fc
  .array(fc.tuple(hunkLines, fc.integer({ min: 1, max: 3 })), { maxLength: 3 })
  .map((generated) => {
    let old = 1;
    let added = 1;

    const hunks = generated.map(([lines, gap]) => {
      const hunk = {
        oldStart: old + gap,
        newStart: added + gap,
        lines: lines.map(({ kind, text, newline, runs }) => ({ kind, text, newline, runs })),
      };

      old = hunk.oldStart + lines.filter(({ kind }) => kind !== "added").length;
      added = hunk.newStart + lines.filter(({ kind }) => kind !== "removed").length;

      return hunk;
    });

    return {
      diff: {
        version: "version",
        kind: "text",
        added: 0,
        removed: 0,
        hunks,
        contents: [],
        newLines: 0,
        review: reviewed,
      },
      numbered: hunks.map(numberLines),
    };
  });

// Which versions of a file have a line: HEAD, the index and the worktree. Most lines are in each,
// so that diffs have runs of unchanged lines between changes, often enough to make several hunks.
const presence = fc.oneof(
  { weight: 3, arbitrary: fc.constant({ head: true, index: true, worktree: true }) },
  {
    weight: 2,
    arbitrary: fc.record({ head: fc.boolean(), index: fc.boolean(), worktree: fc.boolean() }),
  },
);

type Version = "head" | "index" | "worktree";

type Presence = Record<Version, boolean>;

type Line = Diff["hunks"][number]["lines"][number];

// A line of a diff, and how many lines of each version come before it.
interface Entry {
  line: Line;
  old: number;
  new: number;
}

function kindOf(inOld: boolean, inNew: boolean): Line["kind"] {
  if (inOld && inNew) {
    return "context";
  }

  return inOld ? "removed" : "added";
}

// Each of the lines that either version has, as a diff from the one to the other has it.
function entriesOf(
  texts: readonly string[],
  lines: readonly Presence[],
  from: Version,
  to: Version,
) {
  let old = 0;
  let added = 0;

  return lines.flatMap((line, at): Entry[] => {
    const entry = { old, new: added };

    old += line[from] ? 1 : 0;
    added += line[to] ? 1 : 0;

    return line[from] || line[to]
      ? [
          {
            line: {
              kind: kindOf(line[from], line[to]),
              text: texts[at] ?? "",
              newline: true,
              runs: [],
            },
            ...entry,
          },
        ]
      : [];
  });
}

// The diff's hunks: its changes, with up to `context` unchanged lines either side of each, and those
// whose lines touch made one, as git makes them.
function hunksOf(entries: readonly Entry[], context: number): Diff["hunks"] {
  const near = entries.map((_, at) =>
    entries
      .slice(Math.max(0, at - context), at + context + 1)
      .some(({ line }) => line.kind !== "context"),
  );

  const runs: Entry[][] = [];

  for (const [at, entry] of entries.entries()) {
    const last = runs.at(-1);

    if (near[at] === true && near[at - 1] === true && last !== undefined) {
      last.push(entry);
    } else if (near[at] === true) {
      runs.push([entry]);
    }
  }

  return runs.map((run) => {
    const first = run[0] ?? { old: 0, new: 0 };
    const hasOld = run.some(({ line }) => line.kind !== "added");
    const hasNew = run.some(({ line }) => line.kind !== "removed");

    return {
      oldStart: hasOld ? first.old + 1 : first.old,
      newStart: hasNew ? first.new + 1 : first.new,
      lines: run.map(({ line }) => line),
    };
  });
}

// A file's versions in HEAD, the index and the worktree, by which of them have each line, each line
// with text no other has, and its staged diff, from HEAD to the index, and its unstaged one, from the
// index to the worktree, each change with up to `context` unchanged lines either side.
function filesOf(lines: readonly Presence[], context: number) {
  const texts = lines.map((_, at) => `line ${String(at)}`);

  function version(tree: Version): string[] {
    return texts.filter((_, at) => lines[at]?.[tree] === true);
  }

  const staged = hunksOf(entriesOf(texts, lines, "head", "index"), context);
  const unstaged = hunksOf(entriesOf(texts, lines, "index", "worktree"), context);

  return {
    versions: { head: version("head"), index: version("index"), worktree: version("worktree") },
    diffs: {
      staged: { hunks: staged, review: { other: unstaged } },
      unstaged: { hunks: unstaged, review: { other: staged } },
    },
  };
}

const context = fc.integer({ min: 0, max: 3 });

// A file's versions and diffs, often partly staged.
export const partlyStaged = fc
  .record({ lines: fc.array(presence, { maxLength: 24 }), context })
  .map(({ lines, context: around }) => filesOf(lines, around));

// A file's versions and diffs, and its versions and diffs once its index has changed, as staging and
// unstaging change it, with HEAD and the worktree as they were.
export const restaged = fc
  .record({ lines: fc.array(fc.tuple(presence, fc.boolean()), { maxLength: 24 }), context })
  .map(({ lines, context: around }) => ({
    before: filesOf(
      lines.map(([line]) => line),
      around,
    ),
    after: filesOf(
      lines.map(([line, index]) => ({ ...line, index })),
      around,
    ),
  }));

// A file's versions and diffs, and its versions and diffs once its worktree has changed, as an agent
// changes it, or discarding its changes does, with HEAD and the index as they were.
export const rewritten = fc
  .record({ lines: fc.array(fc.tuple(presence, fc.boolean()), { maxLength: 24 }), context })
  .map(({ lines, context: around }) => ({
    before: filesOf(
      lines.map(([line]) => line),
      around,
    ),
    after: filesOf(
      lines.map(([line, worktree]) => ({ ...line, worktree })),
      around,
    ),
  }));
