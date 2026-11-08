import * as fc from "fast-check";
import { expect, test } from "vitest";

import { changes, groupName, hidden, modified, nothingHidden } from "../test/changes";
import { filePath } from "../test/file-names";
import { fileAfter, openAfter, sidebarGroups } from "./groups";
import type { GroupName, Hidden, OpenFile } from "./groups";

type Listed = ReturnType<typeof modified>;

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
        fileAfter({ group, path }, nothingHidden, {
          ...others,
          [group]: [...before, path, other, ...after],
        }),
      ).toStrictEqual({ group, path: other });
    }),
  );
});

test("the file after the last one its group lists is the one before it", () => {
  fc.assert(
    fc.property(groupName, files, changes, (group, { path, other, before }, others) => {
      expect(
        fileAfter({ group, path }, nothingHidden, { ...others, [group]: [...before, other, path] }),
      ).toStrictEqual({ group, path: other });
    }),
  );
});

test("the file after the only one its group lists is the first of the next group that lists any, or else the first the sidebar lists, and none once it lists no other", () => {
  const open: OpenFile = { group: "untracked", path: "a" };

  expect(
    fileAfter(open, nothingHidden, { modified: ["b"], untracked: ["a"], staged: ["d", "c"] }),
  ).toStrictEqual({ group: "staged", path: "d" });
  expect(
    fileAfter(open, nothingHidden, { modified: ["b"], untracked: ["a"], staged: [] }),
  ).toStrictEqual({ group: "modified", path: "b" });
  expect(
    fileAfter(open, nothingHidden, { modified: [], untracked: ["a"], staged: [] }),
  ).toBeUndefined();
});

test("no file is after a group or files selected, nor while nothing is open or the changes aren't listed", () => {
  const listed = modified("a", "b", "c");

  expect(fileAfter({ group: "modified" }, nothingHidden, listed)).toBeUndefined();
  expect(
    fileAfter({ group: "modified", paths: ["a", "b"] }, nothingHidden, listed),
  ).toBeUndefined();
  expect(fileAfter(undefined, nothingHidden, listed)).toBeUndefined();
  expect(fileAfter({ group: "modified", path: "a" }, nothingHidden)).toBeUndefined();
});

// The changes, with each group listing only the files the sidebar shows of it, but the group's,
// which lists those the filter shows, collapsed or not, and the path, if it lists it.
function shownUnder(
  listed: Listed,
  group: GroupName,
  path: string,
  { filter, collapsed }: Hidden,
): Listed {
  const sidebar = sidebarGroups(listed, filter);

  function shown(name: GroupName): string[] {
    const paths = sidebar.find((each) => each.name === name)?.paths ?? [];

    return name === group || !collapsed.includes(name) ? paths : [];
  }

  return {
    modified: shown("modified"),
    untracked: shown("untracked"),
    staged: shown("staged"),
    [group]: listed[group].filter((other) => other === path || shown(group).includes(other)),
  };
}

test("under a filter, and with groups collapsed, the file after the open one is the one after it in groups that list only the files the sidebar shows, but its own group collapsed or not", () => {
  fc.assert(
    fc.property(groupName, filePath, changes, hidden, (group, path, listed, sidebar) => {
      const all = {
        ...listed,
        [group]: [...listed[group].filter((other) => other !== path), path],
      };

      expect(fileAfter({ group, path }, sidebar, all)).toStrictEqual(
        fileAfter({ group, path }, nothingHidden, shownUnder(all, group, path, sidebar)),
      );
    }),
  );
});

test("the file after the open one is the one the view moves on to once the open file leaves its group", () => {
  fc.assert(
    fc.property(groupName, filePath, changes, hidden, (group, path, listed, sidebar) => {
      const others = listed[group].filter((other) => other !== path);
      const all = { ...listed, [group]: [...others, path] };

      expect(fileAfter({ group, path }, sidebar, all)).toStrictEqual(
        openAfter({ group, path }, all, { ...all, [group]: others }, sidebar),
      );
    }),
  );
});

test("under a filter, the file after the open one is the next one the sidebar shows, and none once it shows no other", () => {
  const md: Hidden = { filter: "md", collapsed: [] };

  expect(
    fileAfter({ group: "modified", path: "a.md" }, md, modified("a.md", "b.txt", "c.MD")),
  ).toStrictEqual({ group: "modified", path: "c.MD" });
  expect(
    fileAfter({ group: "modified", path: "a.md" }, md, modified("b.txt", "a.md")),
  ).toBeUndefined();
});

// The open file, where its group lists it before it leaves, and the files the group lists after.
const leaving = fc
  .tuple(filePath, fc.uniqueArray(filePath), fc.nat())
  .chain(([path, others, at]) => {
    const rest = others.filter((other) => other !== path);
    const before = rest.toSpliced(at % (rest.length + 1), 0, path);

    return fc.subarray(rest).map((after) => ({ path, before, after }));
  });

test("once the open file leaves its group under a filter, and with groups collapsed, the view moves on as in groups that list only the files the sidebar shows, but its own group collapsed or not", () => {
  fc.assert(
    fc.property(
      groupName,
      leaving,
      changes,
      hidden,
      (group, { path, before, after }, listed, sidebar) => {
        const then = { ...listed, [group]: before };
        const now = { ...listed, [group]: after };

        expect(openAfter({ group, path }, then, now, sidebar)).toStrictEqual(
          openAfter({ group, path }, then, shownUnder(now, group, path, sidebar), nothingHidden),
        );
      },
    ),
  );
});

test("once the open file leaves its group under a filter, the view moves on to the next file the sidebar shows, and to none once it shows none", () => {
  expect(
    openAfter(
      { group: "modified", path: "a.md" },
      modified("a.md", "b.txt", "c.md"),
      modified("b.txt", "c.md"),
      {
        filter: "md",
        collapsed: [],
      },
    ),
  ).toStrictEqual({ group: "modified", path: "c.md" });
  expect(
    openAfter({ group: "modified", path: "a.md" }, modified("a.md", "b.txt"), modified("b.txt"), {
      filter: "md",
      collapsed: [],
    }),
  ).toBeUndefined();
  expect(
    openAfter({ group: "modified", path: "a.md" }, modified("a.md", "b.md"), modified("b.md"), {
      filter: "",
      collapsed: ["modified"],
    }),
  ).toStrictEqual({ group: "modified", path: "b.md" });
});
