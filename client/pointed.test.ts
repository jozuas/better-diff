import * as fc from "fast-check";
import { expect, test } from "vitest";

import { pointedHunk } from "./pointed";
import type { PointedHunk } from "./pointed";

// The pointer coming over a hunk, by its index, or leaving one. Few hunks, so it often comes over
// the one it's over again.
interface Move {
  hunk: number;
  leaves: boolean;
}

const move: fc.Arbitrary<Move> = fc.record({ hunk: fc.nat(2), leaves: fc.boolean() });

// The hunk the pointer is over after each move: the one it last came over, until it leaves one.
function model(moves: readonly Move[]): (number | undefined)[] {
  let pointed: number | undefined;

  return moves.map(({ hunk, leaves }) => {
    pointed = leaves ? undefined : hunk;

    return pointed;
  });
}

function moved(pointed: PointedHunk, { hunk, leaves }: Move): void {
  const pointer = pointed.pointer(hunk);

  if (leaves) {
    pointer.onPointerLeave();
  } else {
    pointer.onPointerEnter();
  }
}

test("the hunk is the one the pointer last came over, until it leaves one, and none at first", () => {
  fc.assert(
    fc.property(fc.array(move), (moves) => {
      const pointed = pointedHunk();
      const hunks = [pointed.hunk()];

      for (const next of moves) {
        moved(pointed, next);
        hunks.push(pointed.hunk());
      }

      expect(hunks).toStrictEqual([undefined, ...model(moves)]);
    }),
  );
});

test("each listener hears each change of the hunk, once, and nothing once it unsubscribes", () => {
  fc.assert(
    fc.property(fc.array(move), fc.array(move), (heard, unheard) => {
      const pointed = pointedHunk();
      const changes: string[] = [];

      const listeners = ["a", "b"].map((name) =>
        pointed.subscribe(() => {
          changes.push(`${name} ${String(pointed.hunk())}`);
        }),
      );

      const hunks = [undefined, ...model(heard)];
      const changed = hunks.slice(1).filter((hunk, index) => hunk !== hunks[index]);

      for (const next of heard) {
        moved(pointed, next);
      }

      for (const unsubscribe of listeners) {
        unsubscribe();
      }

      for (const next of unheard) {
        moved(pointed, next);
      }

      expect(changes).toStrictEqual(
        changed.flatMap((hunk) => [`a ${String(hunk)}`, `b ${String(hunk)}`]),
      );
    }),
  );
});

test("a hunk's handlers are the same each time, and another hunk's others", () => {
  const pointed = pointedHunk();
  const first = pointed.pointer(0);

  expect(pointed.pointer(0)).toBe(first);
  expect(pointed.pointer(1)).not.toBe(first);
});
