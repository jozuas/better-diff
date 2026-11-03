import * as fc from "fast-check";
import { expect, test } from "vitest";

import { filePath } from "../test/file-names";
import type { GroupName, OpenFile } from "./groups";
import { shownFileKey } from "./shown-diffs";

// Paths whose characters a key could confuse with what it puts between a group and a path.
const openFile: fc.Arbitrary<OpenFile> = fc.record({
  group: fc.constantFrom<GroupName>("modified", "untracked", "staged"),
  path: fc.oneof(filePath, fc.constantFrom("a", 'a"', "a,b", '"modified","a"')),
});

const otherFiles = fc
  .tuple(openFile, openFile)
  .filter(([file, other]) => file.group !== other.group || file.path !== other.path);

test("tells a file apart from another, and from itself opened from another group", () => {
  fc.assert(
    fc.property(otherFiles, ([file, other]) => {
      expect(shownFileKey(other)).not.toBe(shownFileKey(file));
    }),
    {
      examples: [
        [
          [
            { group: "modified", path: "a" },
            { group: "staged", path: "a" },
          ],
        ],
      ],
    },
  );
});

test("tells a file by its group and path alone", () => {
  fc.assert(
    fc.property(openFile, (file) => {
      expect(shownFileKey({ group: file.group, path: file.path })).toBe(shownFileKey(file));
    }),
  );
});
