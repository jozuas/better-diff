import * as fc from "fast-check";
import { expect, test } from "vitest";

import { changes, groupName, modified } from "../test/changes";
import { filePath } from "../test/file-names";
import { openAfter } from "./groups";
import type { Open } from "./groups";

// The changes, with the group listing the path among its files.
function listing(
  listed: ReturnType<typeof modified>,
  group: keyof typeof listed,
  path: string,
): ReturnType<typeof modified> {
  return { ...listed, [group]: [...listed[group].filter((other) => other !== path), path] };
}

test("once the changes are first listed, opens the file the tab showed again while its group lists it", () => {
  fc.assert(
    fc.property(changes, groupName, filePath, (listed, group, path) => {
      const open: Open = { group, path };

      expect(openAfter(open, undefined, listing(listed, group, path))).toBe(open);
    }),
  );
});

test("once the changes are first listed, opens the files the tab showed selected again while their group lists them all", () => {
  fc.assert(
    fc.property(
      changes,
      groupName,
      fc.uniqueArray(filePath, { minLength: 2 }),
      (listed, group, paths) => {
        const open: Open = { group, paths };
        const all = { ...listed, [group]: [...new Set([...listed[group], ...paths])] };

        expect(openAfter(open, undefined, all)).toBe(open);
      },
    ),
  );
});

test("once the changes are first listed, keeps selected those of the files the tab showed selected that their group still lists, in the order they were selected", () => {
  expect(
    openAfter({ group: "modified", paths: ["a", "b", "c"] }, undefined, modified("c", "x", "a")),
  ).toStrictEqual({ group: "modified", paths: ["a", "c"] });
});

test("once the changes are first listed, opens the one file the group still lists of those the tab showed selected", () => {
  expect(
    openAfter({ group: "staged", paths: ["a", "b"] }, undefined, {
      modified: ["a"],
      untracked: [],
      staged: ["b"],
    }),
  ).toStrictEqual({ group: "staged", path: "b" });
});

// The changes, without the paths.
function without(
  listed: ReturnType<typeof modified>,
  group: keyof typeof listed,
  paths: readonly string[],
): ReturnType<typeof modified> {
  return { ...listed, [group]: listed[group].filter((other) => !paths.includes(other)) };
}

test("once the changes are first listed, opens the first file listed, as when the tab showed nothing, if the group no longer lists the file it showed", () => {
  fc.assert(
    fc.property(changes, groupName, filePath, (listed, group, path) => {
      const now = without(listed, group, [path]);

      expect(openAfter({ group, path }, undefined, now)).toStrictEqual(
        openAfter(undefined, undefined, now),
      );
    }),
  );
});

test("once the changes are first listed, opens the first file listed, as when the tab showed nothing, if the group lists none of the files it showed selected", () => {
  fc.assert(
    fc.property(
      changes,
      groupName,
      fc.uniqueArray(filePath, { minLength: 2 }),
      (listed, group, paths) => {
        const now = without(listed, group, paths);

        expect(openAfter({ group, paths }, undefined, now)).toStrictEqual(
          openAfter(undefined, undefined, now),
        );
      },
    ),
  );
});
