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
  // The group's title and its number of files, and how many of them it lists if that's fewer.
  heading: string;
  // Those that match the filter.
  paths: string[];
  // All of them, which an action on the group acts on, while there are some and it lists them all:
  // none while the filter hides some, so the action never reaches a file it doesn't list.
  files: string[] | undefined;
}

// Whether the path has the filter in it, whatever their case. Every path has an empty filter.
function matches(path: string, filter: string): boolean {
  return path.toLowerCase().includes(filter.toLowerCase());
}

export function sidebarGroups(changes: Changes, filter = ""): SidebarGroup[] {
  return order.map((name) => {
    const all = changes[name];
    const paths = all.filter((path) => matches(path, filter));
    const listsAll = paths.length === all.length;
    const count = listsAll ? all.length : `${paths.length} of ${all.length}`;

    return {
      name,
      heading: `${groups[name].title} (${count})`,
      paths,
      files: listsAll && all.length > 0 ? all : undefined,
    };
  });
}

// What shows in place of a diff while no file is open: nothing until the changes are listed, then
// that there are none, or else to open a file.
export function placeholder(changes?: Changes): string {
  if (changes === undefined) {
    return "";
  }

  return order.every((name) => changes[name].length === 0)
    ? "No changes"
    : "Select a file to see its changes.";
}

// A file as opened from a group. A partly staged file is in two, and shows a different diff in each.
export interface OpenFile {
  group: GroupName;
  path: string;
}

export function isOpen(open: OpenFile | undefined, group: GroupName, path: string): boolean {
  return open?.group === group && open.path === path;
}

// The file to show once the changes are listed again, as after an action, from the lists before
// and after: the open file while its group still lists it. Otherwise the next file in the group's
// list before that it still lists, or else the closest one before it, or else the first one it lists
// now. None if it lists none, or none was open, and the open file without both lists.
export function openAfter(
  open: OpenFile | undefined,
  before: Changes | undefined,
  after?: Changes,
): OpenFile | undefined {
  if (
    open === undefined ||
    before === undefined ||
    after === undefined ||
    after[open.group].includes(open.path)
  ) {
    return open;
  }

  const listed = after[open.group];
  const previous = before[open.group];

  // Searched after the files that follow the open one, which are gone by then, the reversed list
  // finds the closest one before it.
  const path = [
    ...previous.slice(previous.indexOf(open.path) + 1),
    ...previous.toReversed(),
    ...listed,
  ].find((candidate) => listed.includes(candidate));

  return path === undefined ? undefined : { group: open.group, path };
}
