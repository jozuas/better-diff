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

// What pairing the removed and added lines of a hunk's runs of changes finds: the changed text of
// each of its lines, by its index, and the index of the added line each paired removed line is
// paired with, by the removed line's.
export interface Pairing {
  changes: (readonly TextRange[])[];
  partners: ReadonlyMap<number, number>;
}

// Each removed line of each of the hunk's runs of changes, paired with an added line of the run or
// not, and the changed text of each line as paired with another.
export function pairingOf(lines: readonly NumberedLine[]): Pairing {
  const changed = new Map<number, TextRange[] | undefined>();
  const partners = new Map<number, number>();

  for (const block of blocksOf(lines)) {
    if ("removed" in block) {
      const run = changedTextOf(textsOf(block.removed), textsOf(block.added), maxLineDistance);

      for (const side of ["removed", "added"] as const) {
        for (const [position, { index }] of block[side].entries()) {
          changed.set(index, run[side][position]);
        }
      }

      for (const [position, { index }] of block.removed.entries()) {
        const partner = block.added.find((_, at) => at === run.partners.get(position));

        if (partner !== undefined) {
          partners.set(index, partner.index);
        }
      }
    }
  }

  return { changes: lines.map((_, index) => changed.get(index) ?? []), partners };
}
