import { changedTextOf } from "./changed-text";
import type { TextRange } from "./changed-text";
import { blocksOf } from "./lines";
import type { IndexedLine, NumberedLine } from "./lines";

// The line's changed text, or none if the line keeps nothing but whitespace, as one rewritten under
// the same indentation, which its tint says changed.
function unlessRewritten(text: string, ranges: readonly TextRange[]): readonly TextRange[] {
  let kept = "";
  let from = 0;

  for (const { start, end } of ranges) {
    kept += text.slice(from, start);
    from = end;
  }

  kept += text.slice(from);

  return /\S/u.test(kept) ? ranges : [];
}

function textsOf(lines: readonly IndexedLine[]): string[] {
  return lines.map(({ line }) => line.text);
}

// The changed text of each of a hunk's lines, by its index: of each removed or added line, compared
// with the others in its run of changes, unless it keeps nothing but whitespace.
export function changedWordsOf(lines: readonly NumberedLine[]): (readonly TextRange[])[] {
  const changed = new Map<number, TextRange[] | undefined>();

  for (const block of blocksOf(lines)) {
    if ("removed" in block) {
      const ranges = changedTextOf(textsOf(block.removed), textsOf(block.added));

      for (const side of ["removed", "added"] as const) {
        for (const [position, { index }] of block[side].entries()) {
          changed.set(index, ranges[side][position]);
        }
      }
    }
  }

  return lines.map(({ text }, index) => unlessRewritten(text, changed.get(index) ?? []));
}
