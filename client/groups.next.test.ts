import * as fc from "fast-check";
import { expect, test } from "vitest";

import { changes, groupName, modified } from "../test/changes";
import { filePath } from "../test/file-names";
import { fileAfter } from "./groups";

// The open file, another file, and files to list before and after them, all different.
const files = fc
  .tuple(filePath, filePath, fc.uniqueArray(filePath), fc.uniqueArray(filePath))
  .filter(([path, other]) => path !== other)
  .map(([path, other, before, after]) => {
    const earlier = before.filter((file) => file !== path && file !== other);

    return {
      path,
      other,
      before: earlier,
      after: after.filter((file) => file !== path && file !== other && !earlier.includes(file)),
    };
  });

test("the file after the open one is the one its group lists next", () => {
  fc.assert(
    fc.property(groupName, files, changes, (group, { path, other, before, after }, others) => {
      expect(
        fileAfter({ group, path }, { ...others, [group]: [...before, path, other, ...after] }),
      ).toStrictEqual({ group, path: other });
    }),
  );
});

test("the file after the last one its group lists is the one before it", () => {
  fc.assert(
    fc.property(groupName, files, changes, (group, { path, other, before }, others) => {
      expect(
        fileAfter({ group, path }, { ...others, [group]: [...before, other, path] }),
      ).toStrictEqual({ group, path: other });
    }),
  );
});

test("no file is after the only one its group lists", () => {
  fc.assert(
    fc.property(groupName, filePath, changes, (group, path, others) => {
      expect(fileAfter({ group, path }, { ...others, [group]: [path] })).toBeUndefined();
    }),
  );
});

test("no file is after a group or files selected, nor while nothing is open or the changes aren't listed", () => {
  const listed = modified("a", "b", "c");

  expect(fileAfter({ group: "modified" }, listed)).toBeUndefined();
  expect(fileAfter({ group: "modified", paths: ["a", "b"] }, listed)).toBeUndefined();
  expect(fileAfter(undefined, listed)).toBeUndefined();
  expect(fileAfter({ group: "modified", path: "a" })).toBeUndefined();
});
