import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";

import type { CommentTarget, ReviewComment } from "../client/comments";
import { numberLines } from "../client/lines";
import type { NumberedLine } from "../client/lines";
import { numberingOf } from "../client/numbering";
import type { diffRpc } from "../shared/diff";
import { filePath } from "./file-names";
import { hunkLines } from "./hunk-lines";

type Diff = RpcOutput<typeof diffRpc>;

// How the review numbers the lines of a file whose diffs change nothing of each other's versions: as
// the diffs number them.
export const asNumbered = numberingOf("unstaged", { hunks: [] });

// Two paths, so that comments are often on the same file, or any path.
const path = fc.oneof(fc.constantFrom("a.txt", "b.txt"), filePath);

const targetParts = {
  path,
  side: fc.constantFrom("old", "new"),
  // Few lines, so that comments are often on the same line.
  line: fc.integer({ min: 1, max: 4 }),
} as const;

export const commentTarget: fc.Arbitrary<CommentTarget> = fc.record(targetParts, {
  noNullPrototype: true,
});

// What a comment says: anything, newlines, `\r`, tabs and non-ASCII among it.
export const commentBody = fc.string({ unit: "binary", maxLength: 10 });

const reviewComment: fc.Arbitrary<ReviewComment> = fc.record(
  { ...targetParts, id: fc.integer({ min: 1, max: 20 }), body: commentBody },
  { noNullPrototype: true },
);

// Pending comments, each with an id of its own, in the order they were made, which is the order of
// their ids.
export const reviewComments = fc
  .uniqueArray(reviewComment, { selector: ({ id }) => id, maxLength: 8 })
  .map((comments) => comments.toSorted((comment, other) => comment.id - other.id));

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
      diff: { version: "version", kind: "text", added: 0, removed: 0, hunks, contents: [] },
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

  return {
    versions: { head: version("head"), index: version("index"), worktree: version("worktree") },
    diffs: {
      staged: { hunks: hunksOf(entriesOf(texts, lines, "head", "index"), context) },
      unstaged: { hunks: hunksOf(entriesOf(texts, lines, "index", "worktree"), context) },
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
