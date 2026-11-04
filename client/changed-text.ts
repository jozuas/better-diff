import { longestCommon } from "./longest-common";
import { wordsOf } from "./words";

// Where a piece of a line's text starts, and where it ends, after its last character.
export interface TextRange {
  start: number;
  end: number;
}

// The most words and breaks removed and added that a run of changes is compared in, since comparing
// takes longer the more there are.
const editLimit = 1000;

// A word of one of a run's lines, by the line's index among the run's removed or added ones and
// where the word starts in its text, or, as null, the break before the line.
interface Piece {
  word: string | null;
  line: number;
  start: number;
}

// The words of the lines, in order, with a break before each line. The removed and added lines'
// first breaks are the same, so what they have in common starts at the start of both.
function piecesOf(lines: readonly string[]): Piece[] {
  return lines.flatMap((text, line) => {
    let start = 0;

    const words = wordsOf(text).map((word) => {
      const piece = { word, line, start };

      start += word.length;

      return piece;
    });

    return [{ word: null, line, start: 0 }, ...words];
  });
}

// Where each piece starts in the text of them all, a break being a character, then where it ends.
function offsetsOf(pieces: readonly Piece[]): number[] {
  const offsets = [0];

  for (const { word } of pieces) {
    offsets.push((offsets.at(-1) ?? 0) + (word?.length ?? 1));
  }

  return offsets;
}

// A run's removed and added pieces' offsets.
interface Offsets {
  old: number[];
  new: number[];
}

// How long the text of the pieces is from the one at `from` up to the one at `to`, or NaN past the
// pieces.
function lengthOf(offsets: readonly number[], from: number, to: number): number {
  return (offsets[to] ?? Number.NaN) - (offsets[from] ?? Number.NaN);
}

// A stretch of pieces the removed and added lines have in common, unchanged: where it starts among
// each's pieces, and how many pieces it has.
interface Stretch {
  old: number;
  new: number;
  count: number;
}

// The pieces in common, by their indices among the removed and added ones, in stretches of those
// that follow each other in both.
function stretchesOf(pairs: readonly [number, number][]): Stretch[] {
  // Stryker disable next-line ArrayDeclaration: the first stretch has the first lines' break, so it's always kept, and nothing before it is weighed.
  const stretches: Stretch[] = [];

  for (const [old, added] of pairs) {
    const last = stretches.at(-1);

    if (last !== undefined && last.old + last.count === old && last.new + last.count === added) {
      last.count += 1;
    } else {
      stretches.push({ old, new: added, count: 1 });
    }
  }

  return stretches;
}

// How much text is both removed and added between the stretches: the less of the two.
function changedBetween(before: Stretch, after: Stretch, offsets: Offsets): number {
  return Math.min(
    lengthOf(offsets.old, before.old + before.count, after.old),
    lengthOf(offsets.new, before.new + before.count, after.new),
  );
}

// Whether the stretch has a break in it, which, being in common, it has in both the removed and the
// added pieces.
function hasBreak(stretch: Stretch, pieces: readonly Piece[]): boolean {
  return pieces.slice(stretch.old, stretch.old + stretch.count).some(({ word }) => word === null);
}

// Whether the stretch is longer than the text that's both removed and added on one side of it,
// before it from the stretch `before`, or after it up to the stretch `after`.
function outweighs(before: Stretch, stretch: Stretch, after: Stretch, offsets: Offsets): boolean {
  const length = lengthOf(offsets.old, stretch.old, stretch.old + stretch.count);

  return (
    length > changedBetween(before, stretch, offsets) ||
    length > changedBetween(stretch, after, offsets)
  );
}

// The stretches but those no longer than the text that's both removed and added on each side of
// them, as a space between two words that both changed is, which count as changed too. Leaving one
// out joins the changes on either side of it, so the stretch before it is checked again. One with a
// break in it stays, so a line's stretches are weighed against what changed between them and its
// start or end, as a line's on its own are, not against what changed in the lines around it. The
// first has the break before the first lines.
function withoutCoincidences(
  stretches: readonly Stretch[],
  offsets: Offsets,
  pieces: readonly Piece[],
): readonly Stretch[] {
  const [first, ...rest] = stretches;

  if (first === undefined) {
    return stretches;
  }

  const end = { old: offsets.old.length - 1, new: offsets.new.length - 1, count: 0 };
  // Stryker disable next-line ArrayDeclaration: the first stretch has the first lines' break, so it's always kept, and nothing before it is weighed.
  const kept: Stretch[] = [];
  let last = first;

  for (const next of [...rest, end]) {
    let before = kept.at(-1);

    while (
      before !== undefined &&
      !outweighs(before, last, next, offsets) &&
      !hasBreak(last, pieces)
    ) {
      last = before;
      kept.pop();
      before = kept.at(-1);
    }

    kept.push(last);
    last = next;
  }

  return kept;
}

// The indices of the pieces the stretches have on a side.
function indicesIn(stretches: readonly Stretch[], side: keyof Offsets): Set<number> {
  return new Set(
    stretches.flatMap((stretch) =>
      Array.from({ length: stretch.count }, (_, index) => stretch[side] + index),
    ),
  );
}

// Each line's words that aren't among the unchanged pieces, in ranges of those that touch.
function rangesOf(lines: number, pieces: readonly Piece[], unchanged: Set<number>): TextRange[][] {
  const ranges = new Map<number, TextRange[]>();

  for (const [index, { word, line, start }] of pieces.entries()) {
    if (word !== null && !unchanged.has(index)) {
      const lineRanges = ranges.get(line) ?? [];
      const last = lineRanges.at(-1);

      if (last?.end === start) {
        last.end += word.length;
      } else {
        lineRanges.push({ start, end: start + word.length });
      }

      ranges.set(line, lineRanges);
    }
  }

  return Array.from({ length: lines }, (_, line) => ranges.get(line) ?? []);
}

// What lines have in common with no lines.
// Stryker disable next-line ArrayDeclaration: pairs that aren't of numbers are of no pieces, so they keep nothing, as no pairs do.
const nothingInCommon: readonly [number, number][] = [];

// The changed text of each of a run's removed lines and each of its added ones.
interface RunChanges {
  removed: TextRange[][];
  added: TextRange[][];
}

// The text that changed in each of a run's removed and added lines: the words that aren't among the
// most the run's removed and added text have in common, in order, but for stretches of those as
// long as at most the text that's both removed and added on each side of them. None if comparing
// them would take more than `editLimit` words and breaks removed and added. Lines with none on the
// other side to compare with have nothing in common with it, which takes no comparing.
export function changedTextOf(removed: readonly string[], added: readonly string[]): RunChanges {
  const oldPieces = piecesOf(removed);
  const newPieces = piecesOf(added);

  const pairs =
    removed.length === 0 || added.length === 0
      ? nothingInCommon
      : longestCommon(
          oldPieces.map(({ word }) => word),
          newPieces.map(({ word }) => word),
          editLimit,
        );

  if (pairs === undefined) {
    return { removed: removed.map(() => []), added: added.map(() => []) };
  }

  const stretches = withoutCoincidences(
    stretchesOf(pairs),
    { old: offsetsOf(oldPieces), new: offsetsOf(newPieces) },
    oldPieces,
  );

  return {
    removed: rangesOf(removed.length, oldPieces, indicesIn(stretches, "old")),
    added: rangesOf(added.length, newPieces, indicesIn(stretches, "new")),
  };
}
