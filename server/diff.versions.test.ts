import * as fc from "fast-check";
import { expect, test } from "vitest";

import { backward, forward } from "../shared/versions";
import { versionLines } from "../test/file-contents";
import type { FileVersions } from "../test/file-contents";
import { inRepository, timeout } from "../test/repository";
import { diffAlgorithm, file, setUp } from "../test/staging";
import type { Side } from "../test/staging";
import { readDiff } from "./diff";

// The versions of the file each side's diff goes from and to.
const versionsOf: Record<Side, [keyof FileVersions, keyof FileVersions]> = {
  unstaged: ["index", "worktree"],
  staged: ["head", "index"],
};

// Each of the numbers from 1 up to the count that the mapping takes somewhere, and where.
function mapped(count: number, map: (number: number) => number | undefined): [number, number][] {
  return Array.from({ length: count }, (_, at) => at + 1).flatMap((number): [number, number][] => {
    const mappedTo = map(number);

    return mappedTo === undefined ? [] : [[number, mappedTo]];
  });
}

function increasing(numbers: readonly number[]): boolean {
  return numbers.every((number, at) => at === 0 || number > (numbers[at - 1] ?? number));
}

test.each<Side>(["unstaged", "staged"])(
  "a line of the version the %s diff goes from is numbered in the version it goes to as the same line, in order, and back, unless the diff removes or adds it",
  async (side) => {
    await fc.assert(
      fc.asyncProperty(file, diffAlgorithm, async ({ path, versions }, algorithm) => {
        await inRepository(async (repository) => {
          setUp(repository, [{ path, versions }], algorithm);

          const diff = await readDiff({ directory: repository, path, side, expand: true });
          const [source, target] = versionsOf[side];
          const old = versionLines(versions[source]);
          const changed = versionLines(versions[target]);
          const forwards = mapped(old.length, (number) => forward(diff.hunks, number));
          const backwards = mapped(changed.length, (number) => backward(diff.hunks, number));

          expect(forwards.map(([, number]) => changed[number - 1])).toStrictEqual(
            forwards.map(([number]) => old[number - 1]),
          );
          expect(increasing(forwards.map(([, number]) => number))).toBe(true);
          expect(backwards).toStrictEqual(forwards.map(([number, there]) => [there, number]));
          expect([old.length - forwards.length, changed.length - backwards.length]).toStrictEqual([
            diff.removed,
            diff.added,
          ]);
        });
      }),
    );
  },
  timeout,
);
