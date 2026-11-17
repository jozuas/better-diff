import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";
import type { Anchor, CommentTarget } from "./comments";
import { numberLines, unchangedLines } from "./lines";
import type { IndexedLine, NumberedLine } from "./lines";
import { numbered, numberIn } from "./numbering";
import type { Numbering } from "./numbering";
import type { Side } from "./side-by-side";

type Diff = RpcOutput<typeof diffRpc>;

// A line on a side, as the review numbers it.
interface LineOnSide {
  side: Side;
  line: number;
  anchor?: Anchor;
}

// How many lines before a comment's line, and after it, tell it apart from others with its text: as
// many as git shows around a change.
const around = 3;

// The texts of the lines next to the line at the index among the lines, in the order they're in,
// before it or after it as `step` goes: those the review numbers one after another from its number
// in the version on its side, `around` at most, up to one that isn't among them. A line the review
// doesn't number there, as one of the other side's version, which inline lines have among them, or
// one only the index has, is passed over.
function nextTo(
  lines: readonly NumberedLine[],
  index: number,
  step: -1 | 1,
  { side, line: from }: LineOnSide,
  numbering: Numbering,
): string[] {
  const found: string[] = [];

  for (let at = index + step; found.length < around; at += step) {
    const line = lines[at];

    if (line === undefined) {
      break;
    }

    const number = numbered(line, side, numbering);

    if (number !== undefined) {
      if (number !== from + step * (found.length + 1)) {
        break;
      }

      found.push(line.text);
    }
  }

  return step === 1 ? found : found.toReversed();
}

// The line on its side, with what tells it apart from the others of its version: the text of the
// line at the index among the lines it's shown with, which it is, and of those next to it there, as
// the review numbers them.
export function anchored<On extends LineOnSide>(
  on: On,
  { index, line }: IndexedLine,
  lines: readonly NumberedLine[],
  numbering: Numbering,
): On & { anchor: Anchor } {
  return {
    ...on,
    anchor: {
      text: line.text,
      before: nextTo(lines, index, -1, on, numbering),
      after: nextTo(lines, index, 1, on, numbering),
    },
  };
}

// The lines of the versions the review numbers lines in, by their numbers there, as comments are
// placed on them, without whitespace, as Hide whitespace has a line whose only change is to
// whitespace unchanged: HEAD's, on the old side, and the worktree's, on the new one, where they're
// known.
export type Versions = Record<Side, readonly string[] | undefined>;

// The text without the whitespace git's --ignore-all-space ignores, which Hide whitespace diffs with:
// spaces, tabs, and `\r` and `\n`, but not other spaces, as a non-breaking one, whose change it shows.
function squeezed(text: string): string {
  return text.replaceAll(/[\t\n\r ]/gu, "");
}

// A diff of a file, as read with every line of its version.
type Read = Pick<Diff, "hunks"> & Partial<Pick<Diff, "contents">>;

// The lines of the versions the diff goes from and to, as `Versions` has them, or undefined for a
// diff without lines, as of a file with no changes there, or only renamed there, or whose mode only
// changed, or only its whitespace, while whitespace changes are hidden.
function linesOf({ hunks, contents = [] }: Read): Record<Side, string[]> | undefined {
  if (hunks.length === 0 && contents.length === 0) {
    return undefined;
  }

  const { before, after } = unchangedLines({ hunks, contents });
  const lines: Record<Side, string[]> = { old: [], new: [] };

  for (const line of [before, ...after, ...hunks.map(numberLines)].flat()) {
    for (const side of ["old", "new"] as const) {
      const number = numberIn(line, side);

      if (number !== undefined) {
        lines[side][number - 1] = squeezed(line.text);
      }
    }
  }

  return lines;
}

// The versions of a file the review numbers lines in, as its unstaged diff and its staged one have
// them, read with every line of their versions, or undefined until both are read: HEAD, which the
// staged diff goes from, or the index, which the unstaged diff goes from, where the staged diff has
// no lines, and the worktree, which the unstaged diff goes to, or the index, which the staged diff
// goes to, where the unstaged diff has none.
export function versionsOf(
  unstaged: Read | undefined,
  staged: Read | undefined,
): Versions | undefined {
  if (unstaged === undefined || staged === undefined) {
    return undefined;
  }

  const fromIndex = linesOf(unstaged);
  const toIndex = linesOf(staged);

  return { old: (toIndex ?? fromIndex)?.old, new: (fromIndex ?? toIndex)?.new };
}

// How many of the lines next to a line of the version at the index are the anchor's.
function aroundIn(anchor: Anchor, lines: readonly string[], index: number): number {
  const before = anchor.before.filter(
    (text, at) => lines[index - anchor.before.length + at] === squeezed(text),
  );

  const after = anchor.after.filter((text, at) => lines[index + 1 + at] === squeezed(text));

  return before.length + after.length;
}

// A line of a version with the anchor's text: its number, how many of the lines next to it are the
// anchor's, and how far it is from the line the anchor was on.
interface Candidate {
  line: number;
  around: number;
  distance: number;
}

function isBetter(candidate: Candidate, best: Candidate | undefined): boolean {
  return (
    best === undefined ||
    candidate.around > best.around ||
    (candidate.around === best.around && candidate.distance < best.distance)
  );
}

// Whether the anchor has none of the lines next to its line, as of a line alone in the part of the
// diff its comment was started in, which nothing but its number then tells apart from others with
// its text.
function isAlone({ before, after }: Anchor): boolean {
  return before.length === 0 && after.length === 0;
}

// The number of the line of the version that the anchor is of: the one line with its text, or of
// several, the one with most of the lines next to it as the anchor has them, and of those, the
// nearest the number it had, the first of two as near. Undefined where none has its text, or
// several do, and none has any of the lines next to it as the anchor has them, unless it has none.
function placedLine(anchor: Anchor, number: number, lines: readonly string[]): number | undefined {
  const text = squeezed(anchor.text);
  let best: Candidate | undefined;
  let found = 0;

  for (const [index, each] of lines.entries()) {
    if (each === text) {
      const candidate = {
        line: index + 1,
        around: aroundIn(anchor, lines, index),
        distance: Math.abs(index + 1 - number),
      };

      found += 1;
      best = isBetter(candidate, best) ? candidate : best;
    }
  }

  return best !== undefined && (best.around > 0 || found === 1 || isAlone(anchor))
    ? best.line
    : undefined;
}

// The number of the line on its side in the version the review has there now: by its anchor, or
// where it has none, or the version's lines aren't known, as of a binary file, its own.
function placedOn(on: LineOnSide, versions: Versions): number | undefined {
  const lines = versions[on.side];

  return on.anchor === undefined || lines === undefined
    ? on.line
    : placedLine(on.anchor, on.line, lines);
}

// Whether the first of a comment's lines, on the line `first` now, comes before its last, on the
// line `last` now, or after it, as it did where they were, in the version both are in. Lines of
// different versions come in no order.
function inOrder(start: LineOnSide, target: LineOnSide, first: number, last: number): boolean {
  return (
    start.side !== target.side || Math.sign(first - last) === Math.sign(start.line - target.line)
  );
}

// The target on the lines its lines are in the versions of its file, the same target where they're
// where they were, or undefined where the versions aren't known, or one of its lines isn't in them,
// the last, or the first of several, as once it's changed or removed, or the first of several is no
// longer before its last, as once the last is removed, and the one line with its text is before the
// first.
export function placedIn<Target extends CommentTarget>(
  target: Target,
  versions: Versions | undefined,
): Target | undefined {
  if (versions === undefined) {
    return undefined;
  }

  const line = placedOn(target, versions);

  if (line === undefined) {
    return undefined;
  }

  const { start } = target;

  if (start === undefined) {
    return line === target.line ? target : { ...target, line };
  }

  const first = placedOn(start, versions);

  if (first === undefined || !inOrder(start, target, first, line)) {
    return undefined;
  }

  return line === target.line && first === start.line
    ? target
    : { ...target, line, start: { ...start, line: first } };
}
