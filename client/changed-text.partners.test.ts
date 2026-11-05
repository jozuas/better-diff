import { expect, test } from "vitest";

import { changedTextOf } from "./changed-text";

test.each<[string[], string[], [number, number][]]>([
  [
    ["aaaa a aaa", "bbbb b bbb", "cccc c ccc"],
    ["bbbb ! bbb", "dddd d ddd", "cccc ! ccc"],
    [
      [1, 0],
      [2, 2],
    ],
  ],
  [["a1 a2 a3", "b1 b2 b3"], ["b1 b2 b4", "a1 a2 a4"], [[0, 1]]],
  [["a1 a2 a3", "a1 a2 a3"], ["a1 a2 a4"], [[0, 0]]],
])(
  "each removed line in turn is paired with the first added line after the last one paired that's similar enough to it: %j to %j",
  (removed, added, partners) => {
    expect([...changedTextOf(removed, added, 0.6).partners]).toStrictEqual(partners);
  },
);
