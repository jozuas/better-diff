import type { Hunk, Line, ParsedDiff } from "./patch";

// A line of a diff's hunks, by its hunk's index and its own index in the hunk.
interface HunkLine {
  hunk: number;
  line: number;
}

// A line, with its number in each version, or where it isn't in one, the number of the version's
// next line.
interface NumberedLine {
  kind: Line["kind"];
  old: number;
  new: number;
}

function numbered(lines: readonly Line[], oldStart: number, newStart: number): NumberedLine[] {
  let old = oldStart;
  let changed = newStart;

  return lines.map(({ kind }) => {
    const line = { kind, old, new: changed };

    old += kind === "added" ? 0 : 1;
    changed += kind === "removed" ? 0 : 1;

    return line;
  });
}

// The change a changed line is, by the version it's in and its number there, as any diff between
// the same versions names it.
function changeOf({ kind, old, new: changed }: NumberedLine): string {
  return kind === "removed" ? `old ${old}` : `new ${changed}`;
}

// The change each changed line of the hunks is, by the line's hunk's index and its own.
function changesOf(hunks: readonly Hunk[]): Map<string, string> {
  const changes = new Map<string, string>();

  for (const [hunk, { oldStart, newStart, lines }] of hunks.entries()) {
    for (const [index, line] of numbered(lines, oldStart, newStart).entries()) {
      if (line.kind !== "context") {
        changes.set(`${hunk}:${index}`, changeOf(line));
      }
    }
  }

  return changes;
}

// What making the changes leaves of the versions, from all of their lines, each named as changeOf
// names it: the old version with the changes, or, undoing them, the new version without them, as
// unstaging and discarding them undoes them.
function leftBy(lines: readonly Line[], changes: ReadonlySet<string>, undo: boolean): string[] {
  return numbered(lines, 1, 1).flatMap((line) => {
    if (line.kind === "context") {
      return [undo ? `new ${line.new}` : `old ${line.old}`];
    }

    const change = changeOf(line);
    const made = changes.has(change) !== undo;

    return made === (line.kind === "added") ? [change] : [];
  });
}

function sameLines(lines: readonly string[], others: readonly string[]): boolean {
  return lines.length === others.length && lines.every((line, index) => line === others[index]);
}

// The lines of the diff's hunks that are the same changes as the lines of the other diff's hunks,
// which goes between the same versions, as the diff with whitespace changes hidden does. Undefined
// where making them, or undoing them, by the diff would leave other lines than by the other diff,
// as where the other one lines the versions up differently and one of its changes is none in the
// diff. Where the other has no lines, as git prints none for a file whose changes are all to
// whitespace, there are none to compare, and none to select.
export function sameChanges(
  diff: ParsedDiff,
  other: ParsedDiff,
  lines: readonly HunkLine[],
  undo: boolean,
): ((hunk: number, line: number) => boolean) | undefined {
  const picked = new Set(lines.map(({ hunk, line }) => `${hunk}:${line}`));

  const changes = new Set<string>();

  for (const [line, change] of changesOf(other.hunks)) {
    if (picked.has(line)) {
      changes.add(change);
    }
  }

  if (
    other.lines.length > 0 &&
    !sameLines(leftBy(diff.lines, changes, undo), leftBy(other.lines, changes, undo))
  ) {
    return undefined;
  }

  const selected = new Set<string>();

  for (const [line, change] of changesOf(diff.hunks)) {
    if (changes.has(change)) {
      selected.add(line);
    }
  }

  return (hunk, line) => selected.has(`${hunk}:${line}`);
}
