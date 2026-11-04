// Myers' algorithm walks a grid with the first list's items across and the second's down, from the
// top left corner to the bottom right. A step right removes an item of the first list, a step down
// adds one of the second, and a step down and right keeps an item both have. A path with a number
// of edits, steps right or down, ends on one of the diagonals x - y = 2 × index - edits, for an
// index from 0, where every edit is a step down, up to the number, where every one is a step right.
// A frontier is how far right the furthest path with a number of edits gets on each of them.

// How far right the furthest path with an edit more than `previous` starts on the diagonal, before
// it keeps what it can: one step down from the end of the furthest path on the diagonal to its
// right, or one step right from the end of the one on the diagonal to its left.
function startOf(previous: readonly number[], diagonal: number): number {
  return Math.max(previous[diagonal] ?? -Infinity, (previous[diagonal - 1] ?? -Infinity) + 1);
}

// The items kept on the way to `end`, (x, y), where the furthest path on its diagonal with an edit
// more than `frontiers` has ends, as the index of each in the first list and in the second.
function pathOf(
  frontiers: readonly (readonly number[])[],
  end: [number, number],
): [number, number][] {
  const pairs: [number, number][] = [];
  let [x, y] = end;

  for (let edits = frontiers.length; edits >= 0; edits -= 1) {
    const previous = frontiers[edits - 1] ?? [0];
    const diagonal = (x - y + edits) / 2;
    const start = startOf(previous, diagonal);

    for (; x > start; x -= 1) {
      y -= 1;
      pairs.push([x - 1, y]);
    }

    if (previous[diagonal] === start) {
      y -= 1;
    } else {
      x -= 1;
    }
  }

  return pairs.toReversed();
}

// The items two lists have in common, as many as there can be in the same order in both, as the
// index of each in the first list and in the second. Its time grows with how many items it takes
// removing from the first list and adding to make the second, so it's undefined if that's more
// than `limit`.
export function longestCommon<Item>(
  first: readonly Item[],
  second: readonly Item[],
  limit: number,
): [number, number][] | undefined {
  const frontiers: number[][] = [];
  let previous = [0];

  for (let edits = 0; edits <= limit; edits += 1) {
    const frontier: number[] = [];

    for (let diagonal = 0; diagonal <= edits; diagonal += 1) {
      let x = startOf(previous, diagonal);
      let y = x - 2 * diagonal + edits;

      while (x < first.length && y < second.length && first[x] === second[y]) {
        x += 1;
        y += 1;
      }

      if (x >= first.length && y >= second.length) {
        return pathOf(frontiers, [x, y]);
      }

      frontier.push(x);
    }

    frontiers.push(frontier);
    previous = frontier;
  }

  return undefined;
}
