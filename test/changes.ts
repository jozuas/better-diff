import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";

import type { GroupName } from "../client/groups";
import type { changesRpc } from "../shared/changes";
import { filePath } from "./file-names";

// The paths changes.list lists in each group.
export const changes = fc.record({
  modified: fc.uniqueArray(filePath),
  untracked: fc.uniqueArray(filePath),
  staged: fc.uniqueArray(filePath),
});

export const groupName = fc.constantFrom<GroupName>("modified", "untracked", "staged");

// The changes of only modified files, at the paths.
export function modified(...paths: string[]): Omit<RpcOutput<typeof changesRpc>, "version"> {
  return { modified: paths, untracked: [], staged: [] };
}
