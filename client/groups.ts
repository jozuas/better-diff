import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import type { changesRpc } from "../shared/changes";
import type { diffRpc } from "../shared/diff";

type Changes = RpcOutput<typeof changesRpc>;

export type GroupName = keyof Changes;

interface Group {
  title: string;
  // The file bar's status for a file opened from the group.
  status: string;
  // The diff a file opened from the group shows.
  side: RpcInput<typeof diffRpc>["side"];
}

export const groups: Record<GroupName, Group> = {
  modified: { title: "MODIFIED FILES", status: "MODIFIED", side: "unstaged" },
  untracked: { title: "UNTRACKED FILES", status: "UNTRACKED", side: "unstaged" },
  staged: { title: "STAGED FILES", status: "STAGED", side: "staged" },
};

const order: GroupName[] = ["modified", "untracked", "staged"];

export interface SidebarGroup {
  name: GroupName;
  // The group's title and its number of files.
  heading: string;
  paths: string[];
}

export function sidebarGroups(changes: Changes): SidebarGroup[] {
  return order.map((name) => ({
    name,
    heading: `${groups[name].title} (${changes[name].length})`,
    paths: changes[name],
  }));
}

// A file as opened from a group. A partly staged file is in two, and shows a different diff in each.
export interface OpenFile {
  group: GroupName;
  path: string;
}

export function isOpen(open: OpenFile | undefined, group: GroupName, path: string): boolean {
  return open?.group === group && open.path === path;
}
