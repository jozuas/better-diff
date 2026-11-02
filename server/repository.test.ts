import { isAbsolute, join, relative, sep } from "node:path";

import * as fc from "fast-check";
import { expect, test } from "vitest";

import { filePath } from "../test/file-names";
import { isIn } from "./repository";

// The root, or a path under it, whose names can start as another's do.
const absolutePath = fc
  .array(fc.oneof(fc.constantFrom("a", "ab"), filePath), { maxLength: 3 })
  .map((names) => join(sep, ...names));

// Whether `relative` finds a way from the directory down to the path.
function isBelow(path: string, directory: string): boolean {
  const way = relative(directory, path);

  return way !== "" && !way.startsWith("..") && !isAbsolute(way);
}

test("a path is in a directory, the root among them, where it's under it, and isn't it, as `relative` says", () => {
  fc.assert(
    fc.property(absolutePath, absolutePath, (path, directory) => {
      expect(isIn(path, directory)).toBe(isBelow(path, directory));
    }),
    {
      examples: [
        [join(sep, "app"), sep],
        [sep, sep],
        [join(sep, "ab"), join(sep, "a")],
      ],
    },
  );
});
