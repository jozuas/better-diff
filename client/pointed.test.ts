import * as fc from "fast-check";
import { expect, test } from "vitest";

import { pointedHunk, pointedLine } from "./pointed";
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

test("a line's handlers are the same each time, and another line's, or the line's on another side, others", () => {
  const pointed = pointedLine();
  const first = pointed.pointer({ index: 0, side: "old" });

  expect(pointed.pointer({ index: 0, side: "old" })).toBe(first);
  expect(pointed.pointer({ index: 1, side: "old" })).not.toBe(first);
  expect(pointed.pointer({ index: 0, side: "new" })).not.toBe(first);
  expect(pointed.pointer({ index: 0, side: undefined })).not.toBe(first);
});

test("the line is the one the pointer last came over, the same each time it comes over it, until it leaves one", () => {
  const pointed = pointedLine();
  const heard: unknown[] = [];

  pointed.subscribe(() => {
    heard.push(pointed.line());
  });
  pointed.pointer({ index: 2, side: undefined }).onPointerEnter();

  const line = pointed.line();

  pointed.pointer({ index: 2, side: undefined }).onPointerEnter();
  pointed.pointer({ index: 2, side: undefined }).onPointerLeave();

  expect(line).toStrictEqual({ index: 2, side: undefined });
  expect(heard).toStrictEqual([line, undefined]);
  expect(heard[0]).toBe(line);
});
