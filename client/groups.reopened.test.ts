import * as fc from "fast-check";
import { expect, test } from "vitest";

import { changes, groupName, modified, nothingHidden } from "../test/changes";
import { filePath } from "../test/file-names";
import { openAfter, sidebarGroups } from "./groups";
import type { Hidden, Open } from "./groups";

test("once the changes are first listed, opens a modified file first, or else an untracked one, or else a staged one", () => {
  expect(
    openAfter(
      undefined,
      undefined,
      { modified: ["b", "a"], untracked: ["c"], staged: ["d"] },
      nothingHidden,
    ),
  ).toStrictEqual({
    group: "modified",
    path: "b",
  });
  expect(
    openAfter(
      undefined,
      undefined,
      { modified: [], untracked: ["c", "a"], staged: ["d"] },
      nothingHidden,
    ),
  ).toStrictEqual({
    group: "untracked",
    path: "c",
  });
  expect(
    openAfter(
      undefined,
      undefined,
      { modified: [], untracked: [], staged: ["d", "a"] },
      nothingHidden,
    ),
  ).toStrictEqual({
    group: "staged",
    path: "d",
  });
});

test("once the changes are first listed, opens no file while no group lists one", () => {
  expect(
    openAfter(undefined, undefined, { modified: [], untracked: [], staged: [] }, nothingHidden),
  ).toBeUndefined();
});

test("once the changes are first listed, opens the first file of the first group the sidebar lists one in", () => {
  fc.assert(
    fc.property(changes, groupName, filePath, (listed, group, path) => {
      const some = { ...listed, [group]: [path, ...listed[group]] };
      const first = sidebarGroups(some).find(({ paths }) => paths.length > 0);

      expect(openAfter(undefined, undefined, some, nothingHidden)).toStrictEqual({
        group: first?.name,
        path: first?.paths[0],
      });
    }),
  );
});

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

      expect(openAfter(open, undefined, listing(listed, group, path), nothingHidden)).toBe(open);
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

        expect(openAfter(open, undefined, all, nothingHidden)).toBe(open);
      },
    ),
  );
});

test("once the changes are first listed, keeps selected those of the files the tab showed selected that their group still lists, in the order they were selected", () => {
  expect(
    openAfter(
      { group: "modified", paths: ["a", "b", "c"] },
      undefined,
      modified("c", "x", "a"),
      nothingHidden,
    ),
  ).toStrictEqual({ group: "modified", paths: ["a", "c"] });
});

test("once the changes are first listed, opens the one file the group still lists of those the tab showed selected", () => {
  expect(
    openAfter(
      { group: "staged", paths: ["a", "b"] },
      undefined,
      {
        modified: ["a"],
        untracked: [],
        staged: ["b"],
      },
      nothingHidden,
    ),
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

      expect(openAfter({ group, path }, undefined, now, nothingHidden)).toStrictEqual(
        openAfter(undefined, undefined, now, nothingHidden),
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

        expect(openAfter({ group, paths }, undefined, now, nothingHidden)).toStrictEqual(
          openAfter(undefined, undefined, now, nothingHidden),
        );
      },
    ),
  );
});

// What a sidebar hides: what's typed in its filter, at times part of a path, and the groups
// collapsed.
const hidden: fc.Arbitrary<Hidden> = fc.record({
  filter: fc.oneof(
    fc.constant(""),
    fc.string({ unit: "grapheme", maxLength: 2 }),
    filePath.map((path) => path.slice(1, 3)),
  ),
  collapsed: fc.subarray(["modified", "untracked", "staged"] as const),
});

test("once the changes are first listed, opens the first file the sidebar lists, with what it hides hidden, or none if it lists none, if the group no longer lists the file the tab showed", () => {
  fc.assert(
    fc.property(changes, hidden, groupName, filePath, (listed, sidebar, group, path) => {
      const now = without(listed, group, [path]);

      const files = sidebarGroups(now, sidebar.filter).flatMap(({ name, paths }) =>
        paths.map((listedPath) => ({ group: name, path: listedPath })),
      );

      const first = files.find((file) => !sidebar.collapsed.includes(file.group));

      expect(openAfter({ group, path }, undefined, now, sidebar)).toStrictEqual(first);
    }),
    {
      examples: [
        [
          { modified: ["a"], untracked: ["b"], staged: [] },
          { filter: "", collapsed: ["modified"] },
          "modified",
          "gone",
        ],
        [
          { modified: ["a"], untracked: ["b"], staged: [] },
          { filter: "b", collapsed: [] },
          "modified",
          "gone",
        ],
      ],
    },
  );
});

test("once the changes are first listed, a file the filter kept hides isn't opened, and the first it lists is", () => {
  expect(
    openAfter(
      { group: "modified", path: "gone.ts" },
      undefined,
      { modified: ["a.ts", "b.MD"], untracked: ["c.md"], staged: [] },
      { filter: "md", collapsed: [] },
    ),
  ).toStrictEqual({ group: "modified", path: "b.MD" });
});

test("once the changes are first listed, a collapsed group's files aren't opened, and the first file of the next group is", () => {
  expect(
    openAfter(
      { group: "modified", path: "gone.ts" },
      undefined,
      { modified: ["a.ts"], untracked: ["b.ts"], staged: ["c.ts"] },
      { filter: "", collapsed: ["modified"] },
    ),
  ).toStrictEqual({ group: "untracked", path: "b.ts" });
});

test("once the changes are first listed, no file opens while the sidebar lists none, though the groups have files", () => {
  expect(
    openAfter(
      { group: "modified", path: "gone.ts" },
      undefined,
      { modified: ["a.ts"], untracked: ["b.ts"], staged: [] },
      { filter: "md", collapsed: ["untracked"] },
    ),
  ).toBeUndefined();
});
