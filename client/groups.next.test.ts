import * as fc from "fast-check";
import { expect, test } from "vitest";

import { changes, groupName, modified, nothingHidden } from "../test/changes";
import { filePath } from "../test/file-names";
import { fileAfter, openAfter, sidebarGroups } from "./groups";
import type { GroupName } from "./groups";

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
        fileAfter({ group, path }, "", { ...others, [group]: [...before, path, other, ...after] }),
      ).toStrictEqual({ group, path: other });
    }),
  );
});

test("the file after the last one its group lists is the one before it", () => {
  fc.assert(
    fc.property(groupName, files, changes, (group, { path, other, before }, others) => {
      expect(
        fileAfter({ group, path }, "", { ...others, [group]: [...before, other, path] }),
      ).toStrictEqual({ group, path: other });
    }),
  );
});

test("no file is after the only one its group lists", () => {
  fc.assert(
    fc.property(groupName, filePath, changes, (group, path, others) => {
      expect(fileAfter({ group, path }, "", { ...others, [group]: [path] })).toBeUndefined();
    }),
  );
});

test("no file is after a group or files selected, nor while nothing is open or the changes aren't listed", () => {
  const listed = modified("a", "b", "c");

  expect(fileAfter({ group: "modified" }, "", listed)).toBeUndefined();
  expect(fileAfter({ group: "modified", paths: ["a", "b"] }, "", listed)).toBeUndefined();
  expect(fileAfter(undefined, "", listed)).toBeUndefined();
  expect(fileAfter({ group: "modified", path: "a" }, "")).toBeUndefined();
});

// The changes, with the group listing only the path, if it lists it, and the files the sidebar
// lists of it under the filter.
function shownUnder(
  listed: ReturnType<typeof modified>,
  group: GroupName,
  path: string,
  filter: string,
): ReturnType<typeof modified> {
  const shown = sidebarGroups(listed, filter).find(({ name }) => name === group)?.paths ?? [];

  return {
    ...listed,
    [group]: listed[group].filter((other) => other === path || shown.includes(other)),
  };
}

// What's typed in a filter, at times part of a path.
const filter = fc.oneof(
  fc.constant(""),
  fc.string({ unit: "grapheme", maxLength: 2 }),
  filePath.map((path) => path.slice(1, 3)),
);

test("under a filter, the file after the open one is the one after it in a group that lists only the files the sidebar shows", () => {
  fc.assert(
    fc.property(groupName, filePath, changes, filter, (group, path, listed, typed) => {
      const all = {
        ...listed,
        [group]: [...listed[group].filter((other) => other !== path), path],
      };

      expect(fileAfter({ group, path }, typed, all)).toStrictEqual(
        fileAfter({ group, path }, "", shownUnder(all, group, path, typed)),
      );
    }),
  );
});

test("under a filter, the file after the open one is the next one the sidebar shows, and none once it shows no other", () => {
  expect(
    fileAfter({ group: "modified", path: "a.md" }, "md", modified("a.md", "b.txt", "c.MD")),
  ).toStrictEqual({ group: "modified", path: "c.MD" });
  expect(
    fileAfter({ group: "modified", path: "a.md" }, "md", modified("b.txt", "a.md")),
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

test("once the open file leaves its group under a filter, the view moves on as in a group that lists only the files the sidebar shows, collapsed or not", () => {
  fc.assert(
    fc.property(
      groupName,
      leaving,
      changes,
      filter,
      fc.subarray(["modified", "untracked", "staged"] as const),
      (group, { path, before, after }, listed, typed, collapsed) => {
        const then = { ...listed, [group]: before };
        const now = { ...listed, [group]: after };

        expect(openAfter({ group, path }, then, now, { filter: typed, collapsed })).toStrictEqual(
          openAfter({ group, path }, then, shownUnder(now, group, path, typed), nothingHidden),
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
