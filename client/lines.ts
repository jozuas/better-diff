import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";

type Diff = RpcOutput<typeof diffRpc>;

type Hunk = Diff["hunks"][number];

// A line with its numbers in the old version of the file and the new one. A removed line has no new
// number, and an added line no old one.
export interface NumberedLine extends Readonly<Hunk["lines"][number]> {
  oldNumber: number | undefined;
  newNumber: number | undefined;
}

export function numberLines({ oldStart, newStart, lines }: Hunk): NumberedLine[] {
  let oldNumber = oldStart;
  let newNumber = newStart;
  const numbered: NumberedLine[] = [];

  for (const line of lines) {
    numbered.push({
      ...line,
      oldNumber: line.kind === "added" ? undefined : oldNumber,
      newNumber: line.kind === "removed" ? undefined : newNumber,
    });

    if (line.kind !== "added") {
      oldNumber += 1;
    }

    if (line.kind !== "removed") {
      newNumber += 1;
    }
  }

  return numbered;
}

// A line with its index among the lines it's shown from.
export interface IndexedLine {
  index: number;
  line: NumberedLine;
}

// The removed and added lines of a run of changes between unchanged lines.
export interface Run {
  removed: IndexedLine[];
  added: IndexedLine[];
}

// The lines in order, each unchanged one on its own, and the removed and added lines of each run of
// changes between them together.
export function blocksOf(lines: readonly NumberedLine[]): (IndexedLine | Run)[] {
  const blocks: (IndexedLine | Run)[] = [];
  let run: Run = { removed: [], added: [] };

  function endRun(): void {
    if (run.removed.length + run.added.length > 0) {
      blocks.push(run);
    }

    run = { removed: [], added: [] };
  }

  for (const [index, line] of lines.entries()) {
    if (line.kind === "context") {
      endRun();
      blocks.push({ index, line });
    } else {
      run[line.kind].push({ index, line });
    }
  }

  endRun();

  return blocks;
}

// The lines of each version before a place in the file.
interface Counts {
  old: number;
  new: number;
}

// How many of a version's lines are before a hunk that starts at the line and has `count` of them:
// git starts a hunk without any at the line before it.
function linesBefore(start: number, count: number): number {
  return count > 0 ? start - 1 : start;
}

// The lines of each version before a hunk, and up to its end.
interface Span {
  start: Counts;
  end: Counts;
}

function spanOf({ oldStart, newStart, lines }: Hunk): Span {
  const old = lines.filter(({ kind }) => kind !== "added").length;
  const added = lines.filter(({ kind }) => kind !== "removed").length;
  const start = { old: linesBefore(oldStart, old), new: linesBefore(newStart, added) };

  return { start, end: { old: start.old + old, new: start.new + added } };
}

// The new version's lines after `from` and before the one at the index `to`, which both versions
// have. Each is shown with a newline: git marks a file's last line without one only in a hunk.
function unchanged(lines: readonly string[], from: Counts, to: number): NumberedLine[] {
  return numberLines({
    oldStart: from.old + 1,
    newStart: from.new + 1,
    lines: lines.slice(from.new, to).map((text) => ({ kind: "context", text, newline: true })),
  });
}

// The lines a text diff's hunks leave out of the file, which neither version changes: those before
// the first hunk, and those after each one, up to the next or the end of the file.
export interface Unchanged {
  before: NumberedLine[];
  after: NumberedLine[][];
}

export function unchangedLines({ hunks, contents }: Pick<Diff, "hunks" | "contents">): Unchanged {
  const spans = hunks.map(spanOf);

  // Where the unchanged lines before the hunk at the index end, or those after the last hunk.
  function upTo(index: number): number {
    return spans[index]?.start.new ?? contents.new.length;
  }

  return {
    before: unchanged(contents.new, { old: 0, new: 0 }, upTo(0)),
    after: spans.map(({ end }, index) => unchanged(contents.new, end, upTo(index + 1))),
  };
}
