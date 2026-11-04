import type { TextRange } from "../client/changed-text";

// The positions of the line's characters outside the ranges.
function keptPositions(line: string, ranges: readonly TextRange[]): number[] {
  return Array.from({ length: line.length }, (_, at) => at).filter(
    (at) => !ranges.some(({ start, end }) => start <= at && at < end),
  );
}

// The line's ranges, by its index.
export function rangesAt(
  ranges: readonly (readonly TextRange[])[],
  index: number,
): readonly TextRange[] {
  return ranges[index] ?? [];
}

// The text of the lines outside their ranges, run together.
export function unchangedText(
  texts: readonly string[],
  ranges: readonly (readonly TextRange[])[],
): string {
  return texts
    .map((line, index) =>
      keptPositions(line, rangesAt(ranges, index))
        .map((at) => line.charAt(at))
        .join(""),
    )
    .join("");
}
