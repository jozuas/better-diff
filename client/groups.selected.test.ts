import * as fc from "fast-check";
import { expect, test } from "vitest";

import { changes, groupName, modified } from "../test/changes";
import { filePath } from "../test/file-names";
import {
  isGroupOpen,
  isOpen,
  isShown,
  openAfter,
  reachedFile,
  selectedBy,
  selectedTo,
} from "./groups";
import type { Open, OpenFile, OpenFiles } from "./groups";

test("the files selected are open only in their group, and no other file is, nor the group", () => {
  const open: OpenFiles = { group: "staged", paths: ["b", "c"] };

  expect(isOpen(open, "staged", "b")).toBe(true);
  expect(isOpen(open, "staged", "c")).toBe(true);
  expect(isOpen(open, "staged", "a")).toBe(false);
  expect(isOpen(open, "modified", "b")).toBe(false);
  expect(isGroupOpen(open, "staged")).toBe(false);
});

test("the diffs of the files selected are shown, and no other file's", () => {
  const open: OpenFiles = { group: "staged", paths: ["b", "c"] };

  expect(isShown(open, "staged", "c")).toBe(true);
  expect(isShown(open, "staged", "a")).toBe(false);
});

const four = ["a", "b", "c", "d"];

test("shift-clicking a file selects the files from the open one to it, down or up the list", () => {
  const open: OpenFile = { group: "modified", path: "b" };

  expect(selectedTo(open, { group: "modified", path: "d" }, four)).toStrictEqual({
    group: "modified",
    paths: ["b", "c", "d"],
  });
  expect(selectedTo(open, { group: "modified", path: "a" }, four)).toStrictEqual({
    group: "modified",
    paths: ["b", "a"],
  });
});

test("shift-clicking a file once files are selected selects from the one the selection starts at", () => {
  const open: OpenFiles = { group: "modified", paths: ["c", "b"] };

  expect(selectedTo(open, { group: "modified", path: "d" }, four)).toStrictEqual({
    group: "modified",
    paths: ["c", "d"],
  });
  expect(selectedTo(open, { group: "modified", path: "c" }, four)).toStrictEqual({
    group: "modified",
    path: "c",
  });
});

test.each<[string, Open | undefined]>([
  ["nothing", undefined],
  ["its group", { group: "modified" }],
  ["a file in another group", { group: "staged", path: "b" }],
  ["files in another group", { group: "staged", paths: ["a", "b"] }],
  ["a file the filter hides", { group: "modified", path: "x" }],
  ["files the filter hides the last of", { group: "modified", paths: ["c", "x"] }],
  ["files the filter hides the first of", { group: "modified", paths: ["x", "c"] }],
])("shift-clicking a file opens just it while %s is open", (_, open) => {
  expect(selectedTo(open, { group: "modified", path: "d" }, four)).toStrictEqual({
    group: "modified",
    path: "d",
  });
});

test("shift+↓ and shift+↑ select one more file or one fewer, from the open one", () => {
  const file = { group: "modified", path: "b" } as const;
  const down = selectedBy(file, file, four, 1);

  expect(down).toStrictEqual({ group: "modified", paths: ["b", "c"] });
  expect(selectedBy(down, file, four, 1)).toStrictEqual({
    group: "modified",
    paths: ["b", "c", "d"],
  });
  expect(selectedBy(down, file, four, -1)).toStrictEqual(file);
});

test("shift+↓ and shift+↑ move on from the file the selection reaches, whichever row focus is in", () => {
  expect(
    selectedBy(
      { group: "modified", paths: ["c", "b"] },
      { group: "modified", path: "d" },
      four,
      -1,
    ),
  ).toStrictEqual({ group: "modified", paths: ["c", "b", "a"] });
});

test("shift+↓ and shift+↑ select nothing more past either end of the list", () => {
  const open: OpenFiles = { group: "modified", paths: ["b", "c", "d"] };
  const first = { group: "modified", path: "a" } as const;

  expect(selectedBy(open, { group: "modified", path: "d" }, four, 1)).toStrictEqual(open);
  expect(selectedBy(first, first, four, -1)).toStrictEqual(first);
});

test("shift+↓ and shift+↑ select from the file with focus while nothing in its group is open", () => {
  expect(
    selectedBy({ group: "staged", path: "a" }, { group: "modified", path: "c" }, four, 1),
  ).toStrictEqual({ group: "modified", paths: ["c", "d"] });
  expect(selectedBy(undefined, { group: "modified", path: "c" }, four, -1)).toStrictEqual({
    group: "modified",
    paths: ["c", "b"],
  });
});

test("the file a selection reaches is the open file, or the last selected", () => {
  expect(reachedFile({ group: "modified", path: "b" })).toBe("b");
  expect(reachedFile({ group: "modified", paths: ["c", "b", "a"] })).toBe("a");
});

// A group's files, and three of them, which may be the same.
const listedAndThree = fc.uniqueArray(filePath, { minLength: 1 }).chain((paths) => {
  const one = fc.constantFrom(...paths);

  return fc.tuple(fc.constant(paths), one, one, one);
});

// How far each of the paths is down the list from the one before it.
function stepsIn(list: readonly string[], paths: readonly string[]): number[] {
  return paths.slice(1).map((path, index) => list.indexOf(path) - list.indexOf(paths[index] ?? ""));
}

// The file after the path in the list, or before it, or the path itself past either end.
function nextTo(list: readonly string[], path: string, by: 1 | -1): string {
  return list[list.indexOf(path) + by] ?? path;
}

// The paths of the files open: the open file's, or those selected. None while a group is, or
// nothing is.
function pathsOf(open: Open | undefined): readonly string[] {
  if (open === undefined) {
    return [];
  }

  if ("paths" in open) {
    return open.paths;
  }

  return open.path === undefined ? [] : [open.path];
}

test("shift-clicking a file selects the files next to each other in the list from the open one to it", () => {
  fc.assert(
    fc.property(listedAndThree, ([paths, start, clicked]) => {
      const selected = pathsOf(
        selectedTo(
          { group: "untracked", path: start },
          { group: "untracked", path: clicked },
          paths,
        ),
      );

      const steps = stepsIn(paths, selected);

      expect(selected[0]).toBe(start);
      expect(selected.at(-1)).toBe(clicked);
      expect(steps.every((between) => Math.abs(between) === 1)).toBe(true);
      expect(new Set(steps).size).toBeLessThanOrEqual(1);
    }),
  );
});

test("shift-clicking one file, then another, selects as shift-clicking just the other does", () => {
  fc.assert(
    fc.property(listedAndThree, ([paths, start, first, second]) => {
      const open: OpenFile = { group: "staged", path: start };
      const clicked = selectedTo(open, { group: "staged", path: first }, paths);

      expect(selectedTo(clicked, { group: "staged", path: second }, paths)).toStrictEqual(
        selectedTo(open, { group: "staged", path: second }, paths),
      );
    }),
  );
});

// Shift+↓ and then Shift+↑, or Shift+↑ and then Shift+↓.
const steps = fc.constantFrom<[1 | -1, 1 | -1]>([1, -1], [-1, 1]);

test("shift+↓ and shift+↑ select as shift-clicking the file after or before the one the selection reaches does, if there's one", () => {
  fc.assert(
    fc.property(listedAndThree, steps, ([paths, start, reached, focused], [by]) => {
      const open = selectedTo(
        { group: "modified", path: start },
        { group: "modified", path: reached },
        paths,
      );

      expect(selectedBy(open, { group: "modified", path: focused }, paths, by)).toStrictEqual(
        selectedTo(open, { group: "modified", path: nextTo(paths, reached, by) }, paths),
      );
    }),
  );
});

test("shift+↓ then shift+↑, or shift+↑ then shift+↓, selects what was, short of either end of the list", () => {
  fc.assert(
    fc.property(listedAndThree, steps, ([paths, start, reached, focused], [by, back]) => {
      fc.pre(nextTo(paths, reached, by) !== reached);

      const open = selectedTo(
        { group: "modified", path: start },
        { group: "modified", path: reached },
        paths,
      );

      const file = { group: "modified", path: focused } as const;

      expect(selectedBy(selectedBy(open, file, paths, by), file, paths, back)).toStrictEqual(open);
    }),
  );
});

test("keeps the files selected their group still lists after an action, as after staging a hunk of one", () => {
  const open: OpenFiles = { group: "modified", paths: ["c", "b"] };

  expect(openAfter(open, modified("a", "b", "c"), modified("a", "b", "c", "d"))).toBe(open);
});

test("keeps those of the files selected their group still lists, once others leave it", () => {
  expect(
    openAfter(
      { group: "modified", paths: ["d", "c", "b"] },
      modified("a", "b", "c", "d"),
      modified("a", "b", "d"),
    ),
  ).toStrictEqual({ group: "modified", paths: ["d", "b"] });
  expect(
    openAfter(
      { group: "modified", paths: ["b", "c"] },
      modified("a", "b", "c"),
      modified("a", "c"),
    ),
  ).toStrictEqual({ group: "modified", path: "c" });
});

test("moves on from the files selected, once they all leave the group, to the next file after them, or else the closest one before them", () => {
  expect(
    openAfter(
      { group: "modified", paths: ["c", "b"] },
      modified("a", "b", "c", "d"),
      modified("a", "d"),
    ),
  ).toStrictEqual({ group: "modified", path: "d" });
  expect(
    openAfter({ group: "modified", paths: ["b", "c"] }, modified("a", "b", "c"), modified("a")),
  ).toStrictEqual({ group: "modified", path: "a" });
});

test("moves on past a file the filter hid between the files selected, once they all leave the group", () => {
  expect(
    openAfter(
      { group: "modified", paths: ["d", "b"] },
      modified("a", "b", "c", "d", "e"),
      modified("a", "c", "e"),
    ),
  ).toStrictEqual({ group: "modified", path: "e" });
});

// Files selected, and what their group lists after an action: some of them, and other files.
const selectedAndListed = fc
  .uniqueArray(filePath, { minLength: 2 })
  .chain((paths) =>
    fc.tuple(fc.constant(paths), fc.uniqueArray(fc.oneof(fc.constantFrom(...paths), filePath))),
  );

test("keeps those of the files selected their group lists after the action, in their order", () => {
  fc.assert(
    fc.property(
      groupName,
      selectedAndListed,
      changes,
      changes,
      (group, [paths, listed], before, after) => {
        const kept = paths.filter((path) => listed.includes(path));

        fc.pre(kept.length > 0);

        const next = openAfter({ group, paths }, before, { ...after, [group]: listed });

        expect(next?.group).toBe(group);
        expect(pathsOf(next)).toStrictEqual(kept);
      },
    ),
  );
});

test("opens a file the group lists after the action, once it lists none of the files selected", () => {
  fc.assert(
    fc.property(
      groupName,
      selectedAndListed,
      changes,
      changes,
      (group, [paths, listed], before, after) => {
        fc.pre(listed.length > 0);
        fc.pre(!paths.some((path) => listed.includes(path)));

        const next = openAfter({ group, paths }, before, { ...after, [group]: listed });

        expect(next?.group).toBe(group);
        expect(listed).toContain(next?.path);
      },
    ),
  );
});
