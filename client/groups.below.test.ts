import * as fc from "fast-check";
import { expect, test } from "vitest";

import { changes, groupName, hidden, modified, nothingHidden } from "../test/changes";
import { filePath } from "../test/file-names";
import { openAfter, sidebarGroups } from "./groups";
import type { GroupName, Hidden, OpenFile } from "./groups";

type Listed = ReturnType<typeof modified>;

test("moves on to the first file of the next group that lists any, once the open file's group lists none", () => {
  expect(
    openAfter(
      { group: "modified", path: "a" },
      modified("a"),
      { modified: [], untracked: ["c", "b"], staged: ["a"] },
      nothingHidden,
    ),
  ).toStrictEqual({ group: "untracked", path: "c" });
  expect(
    openAfter(
      { group: "untracked", path: "b" },
      { modified: ["a"], untracked: ["b"], staged: [] },
      { modified: ["a"], untracked: [], staged: ["c", "b"] },
      nothingHidden,
    ),
  ).toStrictEqual({ group: "staged", path: "c" });
  expect(
    openAfter(
      { group: "modified", path: "a" },
      modified("a"),
      { modified: [], untracked: [], staged: ["a"] },
      nothingHidden,
    ),
  ).toStrictEqual({ group: "staged", path: "a" });
});

test("moves back round to the first file the sidebar lists, once no group after the open file's lists any", () => {
  expect(
    openAfter(
      { group: "staged", path: "a" },
      { modified: [], untracked: [], staged: ["a"] },
      { modified: ["b"], untracked: ["a"], staged: [] },
      nothingHidden,
    ),
  ).toStrictEqual({ group: "modified", path: "b" });
  expect(
    openAfter(
      { group: "untracked", path: "a" },
      { modified: [], untracked: ["a"], staged: [] },
      { modified: ["b"], untracked: [], staged: [] },
      nothingHidden,
    ),
  ).toStrictEqual({ group: "modified", path: "b" });
});

test("moves on past a collapsed group, and past the files the filter hides, once the open file's group lists none", () => {
  const after = { modified: [], untracked: ["b.md"], staged: ["c.txt", "d.md"] };

  expect(
    openAfter({ group: "modified", path: "a.md" }, modified("a.md"), after, {
      filter: "",
      collapsed: ["untracked"],
    }),
  ).toStrictEqual({ group: "staged", path: "c.txt" });
  expect(
    openAfter({ group: "modified", path: "a.md" }, modified("a.md"), after, {
      filter: "md",
      collapsed: ["untracked"],
    }),
  ).toStrictEqual({ group: "staged", path: "d.md" });
  expect(
    openAfter({ group: "modified", path: "a.md" }, modified("a.md"), after, {
      filter: "md",
      collapsed: ["untracked", "staged"],
    }),
  ).toBeUndefined();
});

test("opens no file once no group lists any", () => {
  expect(
    openAfter(
      { group: "modified", path: "a" },
      modified("a"),
      { modified: [], untracked: [], staged: [] },
      nothingHidden,
    ),
  ).toBeUndefined();
});

const groupNames: GroupName[] = ["modified", "untracked", "staged"];

// The changes once the open file at the path leaves the group, with the group listing only the
// files the filter hides of it.
function noneShownIn(listed: Listed, group: GroupName, path: string, filter: string): Listed {
  const shown = sidebarGroups(listed, filter).find(({ name }) => name === group)?.paths ?? [];

  return {
    ...listed,
    [group]: listed[group].filter((other) => other !== path && !shown.includes(other)),
  };
}

// Of the files the sidebar shows, in its order, the first in a group below the group, or else the
// first.
function firstBelow(
  listed: Listed,
  group: GroupName,
  { filter, collapsed }: Hidden,
): OpenFile | undefined {
  const shown = sidebarGroups(listed, filter)
    .filter(({ name }) => !collapsed.includes(name))
    .flatMap(({ name, paths }) => paths.map((path) => ({ group: name, path })));

  return (
    shown.find((file) => groupNames.indexOf(file.group) > groupNames.indexOf(group)) ?? shown[0]
  );
}

test("once the open file's group shows no file, the view moves on to the first file the sidebar shows below the group, or else the first it shows, and to none once it shows none", () => {
  fc.assert(
    fc.property(
      groupName,
      filePath,
      changes,
      changes,
      hidden,
      (group, path, then, listed, sidebar) => {
        const now = noneShownIn(listed, group, path, sidebar.filter);

        expect(
          openAfter({ group, path }, { ...then, [group]: [path] }, now, sidebar),
        ).toStrictEqual(firstBelow(now, group, sidebar));
      },
    ),
  );
});
