import { changedTextOf } from "./changed-text";
import type { TextRange } from "./changed-text";
import { blocksOf } from "./lines";
import type { IndexedLine, NumberedLine } from "./lines";

// How different a removed line and an added one can be and still be paired, as delta's
// --max-line-distance is by default.
const maxLineDistance = 0.6;

function textsOf(lines: readonly IndexedLine[]): string[] {
  return lines.map(({ line }) => line.text);
}

// The changed text of each of a hunk's lines, by its index: of each removed or added line, as
// paired with another in its run of changes.
export function changedWordsOf(lines: readonly NumberedLine[]): (readonly TextRange[])[] {
  const changed = new Map<number, TextRange[] | undefined>();

  for (const block of blocksOf(lines)) {
    if ("removed" in block) {
      const ranges = changedTextOf(textsOf(block.removed), textsOf(block.added), maxLineDistance);

      for (const side of ["removed", "added"] as const) {
        for (const [position, { index }] of block[side].entries()) {
          changed.set(index, ranges[side][position]);
        }
      }
    }
  }

  return lines.map((_, index) => changed.get(index) ?? []);
}
