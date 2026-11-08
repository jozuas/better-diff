import * as fc from "fast-check";
import { expect, test } from "vitest";

import { listedAndThree } from "../test/changes";
import { isReached, selectedTo } from "./groups";
import type { Open } from "./groups";

test.each<[Open | undefined, string, boolean]>([
  [{ group: "modified", paths: ["c", "b", "a"] }, "a", true],
  [{ group: "modified", paths: ["c", "b", "a"] }, "b", false],
  [{ group: "modified", paths: ["c", "b", "a"] }, "c", false],
  [{ group: "staged", paths: ["c", "b", "a"] }, "a", false],
  [{ group: "modified", path: "b" }, "b", true],
  [{ group: "modified", path: "b" }, "a", false],
  [{ group: "staged", path: "a" }, "a", false],
  [{ group: "modified" }, "a", false],
  [undefined, "a", false],
])(
  "of the files selected only the one they reach is reached, as the open file is: with %j open, modified %s is reached: %s",
  (open, path, reached) => {
    expect(isReached(open, "modified", path)).toBe(reached);
  },
);

test("shift-clicking a file leaves it the only file reached", () => {
  fc.assert(
    fc.property(listedAndThree, ([paths, start, clicked, other]) => {
      const selected = selectedTo(
        { group: "modified", path: start },
        { group: "modified", path: clicked },
        paths,
      );

      expect(isReached(selected, "modified", other)).toBe(other === clicked);
    }),
  );
});
