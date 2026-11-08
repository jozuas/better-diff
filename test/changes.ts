import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";

import type { GroupName, Hidden } from "../client/groups";
import type { changesRpc } from "../shared/changes";
import { filePath } from "./file-names";

// The paths changes.list lists in each group.
export const changes = fc.record({
  modified: fc.uniqueArray(filePath),
  untracked: fc.uniqueArray(filePath),
  staged: fc.uniqueArray(filePath),
});

export const groupName = fc.constantFrom<GroupName>("modified", "untracked", "staged");

// What a sidebar hides that has nothing in its filter and no group collapsed: nothing.
export const nothingHidden: Hidden = { filter: "", collapsed: [] };

// What's typed in a filter, at times part of a path.
const typed = fc.oneof(
  fc.constant(""),
  fc.string({ unit: "grapheme", maxLength: 2 }),
  filePath.map((path) => path.slice(1, 3)),
);

// What a sidebar hides: the files whose paths haven't what's typed in its filter, and the groups
// collapsed.
export const hidden: fc.Arbitrary<Hidden> = fc.record({
  filter: typed,
  collapsed: fc.subarray<GroupName>(["modified", "untracked", "staged"]),
});

// The changes of only modified files, at the paths.
export function modified(...paths: string[]): Omit<RpcOutput<typeof changesRpc>, "version"> {
  return { modified: paths, untracked: [], staged: [] };
}

// A group's files, and three of them, which may be the same.
export const listedAndThree = fc.uniqueArray(filePath, { minLength: 1 }).chain((paths) => {
  const one = fc.constantFrom(...paths);

  return fc.tuple(fc.constant(paths), one, one, one);
});
