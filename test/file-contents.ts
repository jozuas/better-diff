import * as fc from "fast-check";

// The bytes a line is made of: letters, a space, a tab, `\r` (as at the end of each line of a CRLF
// file), é, bytes that aren't UTF-8 (0xff, and é's first byte on its own), and what a diff's own
// syntax uses: a backslash and a hunk's start, as in a patch file. Few enough that lines often
// repeat, which leaves git a choice of how to line two versions up. Never NUL, which makes git take
// a file for binary.
const piece: fc.Arbitrary<readonly number[]> = fc.constantFrom(
  [0x61],
  [0x62],
  [0x20],
  [0x09],
  [0x0d],
  [0xc3, 0xa9],
  [0xff],
  [0xc3],
  [0x5c],
  [...Buffer.from("@@ -1 +1 @@")],
);

interface Trees<T> {
  head: T;
  index: T;
  worktree: T;
}

export type FileVersions = Trees<Buffer>;

interface Line {
  bytes: Buffer;
  // Which versions have the line.
  presence: Trees<boolean>;
}

const lineBytes = fc.array(piece, { maxLength: 3 }).map((pieces) => Buffer.from(pieces.flat()));

function trees<T>(arbitrary: fc.Arbitrary<T>): fc.Arbitrary<Trees<T>> {
  return fc.record({ head: arbitrary, index: arbitrary, worktree: arbitrary });
}

// Most lines are in every version, so diffs between them have runs of unchanged lines between
// changes, often long enough to make several hunks.
const presence: fc.Arbitrary<Trees<boolean>> = fc.oneof(
  { weight: 6, arbitrary: fc.constant({ head: true, index: true, worktree: true }) },
  { weight: 1, arbitrary: trees(fc.boolean()) },
);

// Now and then a version is empty, as a new or emptied file is, so a diff has a hunk that one
// version has no lines in.
const isEmptied = fc.oneof(
  { weight: 6, arbitrary: fc.constant(false) },
  { weight: 1, arbitrary: fc.constant(true) },
);

const newline = Buffer.from("\n");

function version(lines: readonly Line[], finalNewline: boolean, tree: keyof Trees<never>): Buffer {
  const present = lines.flatMap((line) => (line.presence[tree] ? [line.bytes] : []));

  return Buffer.concat(
    present.flatMap((line, index) =>
      index < present.length - 1 || finalNewline ? [line, newline] : [line],
    ),
  );
}

// A file's content in HEAD, in the index and in the worktree.
export const fileVersions: fc.Arbitrary<FileVersions> = fc
  .record({
    // Up to 60 lines, rather than fast-check's usual handful, so a diff often has several hunks.
    lines: fc.array(fc.record({ bytes: lineBytes, presence }), { maxLength: 60, size: "max" }),
    // Whether each version's last line ends with a newline.
    finalNewline: trees(fc.boolean()),
    emptied: trees(isEmptied),
  })
  .map(({ lines, finalNewline, emptied }) => ({
    head: emptied.head ? Buffer.alloc(0) : version(lines, finalNewline.head, "head"),
    index: emptied.index ? Buffer.alloc(0) : version(lines, finalNewline.index, "index"),
    worktree: emptied.worktree
      ? Buffer.alloc(0)
      : version(lines, finalNewline.worktree, "worktree"),
  }));
