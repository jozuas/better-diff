// Aligns two lists of tokens as delta's within-line diff does, in its align.rs
// (https://github.com/dandavison/delta, MIT licence, copyright 2020 Dan Davison): with a
// Wagner–Fischer table of what turning the first list into the second costs, where removing or
// adding a token costs 2, and starting a group of them 1 more, so changes group together.

// What an edit does with a token: keeps one both lists have, removes one of the first's, or adds one
// of the second's.
export type Operation = "keep" | "remove" | "add";

// The kinds of edit, as the table holds them.
const keep = 0;
const remove = 1;
const add = 2;

const removalCost = 2;
const additionCost = 2;
const groupCost = 1;

// The edits that turn `first` into `second` at the least cost, in order. Where edits of different
// kinds cost the same, an addition comes first, then a removal, then keeping a token, as the table
// is read from its end, so a moved token is removed and then added.
export function operationsOf(first: readonly string[], second: readonly string[]): Operation[] {
  // A cell of the table for each start of each list, by the start's length in the first list, its
  // column, plus the row, the start's length in the second, times the width: what turning the
  // first start into the second costs at least, and the kind of the last edit on the way.
  const width = first.length + 1;
  const costs = new Float64Array(width * (second.length + 1));
  const kinds = new Uint8Array(costs.length);

  for (let row = 1; row <= second.length; row += 1) {
    costs[row * width] = row * additionCost + groupCost;
    kinds[row * width] = add;
  }

  for (let column = 1; column < width; column += 1) {
    costs[column] = column * removalCost + groupCost;
    kinds[column] = remove;
  }

  // The cost of an edit after the cell's, which starts a group unless the cell's is a change too.
  function costAfter(cell: number, cost: number): number {
    return (costs[cell] ?? 0) + cost + (kinds[cell] === keep ? groupCost : 0);
  }

  for (const [column, token] of first.entries()) {
    for (const [row, other] of second.entries()) {
      const cell = (row + 1) * width + column + 1;
      const removal = costAfter(cell - 1, removalCost);
      const keeping = token === other ? (costs[cell - width - 1] ?? 0) : Infinity;
      let kind = add;
      let cost = costAfter(cell - width, additionCost);

      if (removal < cost) {
        kind = remove;
        cost = removal;
      }

      if (keeping < cost) {
        kind = keep;
        cost = keeping;
      }

      costs[cell] = cost;
      kinds[cell] = kind;
    }
  }

  const edits: Operation[] = [];
  let column = first.length;
  let row = second.length;

  while (column + row > 0) {
    const kind = kinds[row * width + column];

    if (kind === add) {
      edits.push("add");
      row -= 1;
    } else if (kind === remove) {
      edits.push("remove");
      column -= 1;
    } else {
      edits.push("keep");
      column -= 1;
      row -= 1;
    }
  }

  return edits.toReversed();
}
