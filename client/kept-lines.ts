// The most lines that can be removed and added between two versions of what a view shows for a
// line of the first to be found in the second: aligning versions takes as long as they are times
// how many.
const followedEdits = 1000;

// A line both versions keep, by its index in each.
type Kept = readonly [number, number];

// For each diagonal of the edit graph, by its number plus `offset`, the furthest index in the
// first version that a path with `edits` edits reaches on it.
interface Reach {
  edits: number;
  furthest: Int32Array;
  offset: number;
}

function at({ furthest, offset }: Reach, diagonal: number): number {
  return furthest[offset + diagonal] ?? 0;
}

// Whether a path with one more edit than the reach's reaches the diagonal from the one above it, by
// adding a line, rather than from the one below it, by removing one. A diagonal no path has reached
// yet holds 0, which is never further than the one beside it.
function fromAbove(reach: Reach, diagonal: number): boolean {
  return diagonal === -reach.edits - 1 || at(reach, diagonal - 1) < at(reach, diagonal + 1);
}

// The lines a shortest path keeps, back from the end, from what each number of edits before the
// last reached.
function keptOn(reached: readonly Reach[], before: number, after: number): Kept[] {
  const kept: Kept[] = [];
  let line = before;
  let other = after;

  for (const reach of reached.toReversed()) {
    const diagonal = line - other;
    const previous = fromAbove(reach, diagonal) ? diagonal + 1 : diagonal - 1;
    const start = at(reach, previous);

    while (line > start && other > start - previous) {
      line -= 1;
      other -= 1;
      kept.push([line, other]);
    }

    line = start;
    other = start - previous;
  }

  return kept.toReversed();
}

// The lines both versions keep, in order, as few edits as possible turning one into the other, as
// Myers's algorithm (An O(ND) Difference Algorithm and Its Variations, 1986) finds them. Undefined
// if that takes more than followedEdits.
function keptLines(before: readonly string[], after: readonly string[]): Kept[] | undefined {
  const most = Math.min(followedEdits, before.length + after.length);
  const furthest = new Int32Array(2 * most + 3);
  const offset = most + 1;
  // What each number of edits before the current one reached, on the diagonals the next can reach
  // from.
  const reached: Reach[] = [];

  for (let edits = 0; edits <= most; edits += 1) {
    const reach = { edits: edits - 1, furthest, offset };

    reached.push({
      edits: edits - 1,
      furthest: furthest.slice(offset - edits - 1, offset + edits + 2),
      offset: edits + 1,
    });

    for (let diagonal = -edits; diagonal <= edits; diagonal += 2) {
      let line = fromAbove(reach, diagonal) ? at(reach, diagonal + 1) : at(reach, diagonal - 1) + 1;

      while (before[line] !== undefined && before[line] === after[line - diagonal]) {
        line += 1;
      }

      furthest[offset + diagonal] = line;

      if (line >= before.length && line - diagonal >= after.length) {
        return keptOn(reached, before.length, after.length);
      }
    }
  }

  return undefined;
}

// The index in `after`, a later version of the lines a view shows, of the line at the index in
// `before`: the line itself, if the versions keep it, or else the one that takes its place, as many
// lines into those that replace the lines between the ones kept around it, or else the line after
// them, or the last. -1 if `after` has no lines, or the versions are too far apart to tell.
export function keptLine(
  before: readonly string[],
  after: readonly string[],
  index: number,
): number {
  const kept = keptLines(before, after);

  if (kept === undefined) {
    return -1;
  }

  const last = kept.findLastIndex(([line]) => line <= index);
  const [line, other] = kept[last] ?? [-1, -1];
  const end = kept[last + 1]?.[1] ?? after.length;

  return Math.min(other + 1 + Math.min(index - line - 1, end - other - 1), after.length - 1);
}
