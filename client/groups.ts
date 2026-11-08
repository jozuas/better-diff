import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import type { changesRpc } from "../shared/changes";
import type { diffRpc, groupRpc } from "../shared/diff";

// The files changes.list lists in each group.
type Changes = Omit<RpcOutput<typeof changesRpc>, "version">;

type Diff = RpcOutput<typeof diffRpc>;

type GroupRead = RpcOutput<typeof groupRpc>;

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

// The groups collapsed once the group's triangle is pressed, which collapses it, or expands it if
// it's collapsed.
export function toggled(collapsed: GroupName[], name: GroupName): GroupName[] {
  return collapsed.includes(name)
    ? collapsed.filter((other) => other !== name)
    : [...collapsed, name];
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

// A group as opened from its heading, which shows the diffs of all the files it lists.
interface OpenGroup {
  group: GroupName;
  path?: undefined;
}

// Files selected in a group, as shift-clicking one of them selects them, which show their diffs as
// a group's files do: two or more, from the one the selection starts at to the one it reaches.
export interface OpenFiles {
  group: GroupName;
  paths: string[];
  path?: undefined;
}

export type Open = OpenFile | OpenGroup | OpenFiles;

// What the sidebar hides: the files whose paths don't have the filter in them, and those of the
// groups collapsed.
export interface Hidden {
  filter: string;
  collapsed: readonly GroupName[];
}

// The file the sidebar lists first, with what it hides hidden, which opens once the changes are
// first listed, if it lists any.
function firstFile(changes: Changes, { filter, collapsed }: Hidden): OpenFile | undefined {
  const [first] = order.flatMap((group) =>
    collapsed.includes(group)
      ? []
      : changes[group].flatMap((path) => (matches(path, filter) ? [{ group, path }] : [])),
  );

  return first;
}

// The open file's path, or those of the files selected. None while a group is open.
function openPaths(open: Open): readonly string[] {
  if ("paths" in open) {
    return open.paths;
  }

  return open.path === undefined ? [] : [open.path];
}

// Whether the file the group lists is open, or one of the files selected.
export function isOpen(open: Open | undefined, group: GroupName, path: string): boolean {
  return open?.group === group && openPaths(open).includes(path);
}

export function isGroupOpen(open: Open | undefined, group: GroupName): boolean {
  return open?.group === group && openPaths(open).length === 0;
}

// Whether the diff of the file the group lists is shown: the file is open, or selected, or the group
// is open.
export function isShown(open: Open | undefined, group: GroupName, path: string): boolean {
  return isOpen(open, group, path) || isGroupOpen(open, group);
}

// What's open, as the row of the file the group lists shows it: what's open while the file's diff
// is shown, and otherwise nothing, which the row shows the same, so the row stays the same as other
// files open.
export function rowOpen(open: Open | undefined, group: GroupName, path: string): Open | undefined {
  return isShown(open, group, path) ? open : undefined;
}

// The file the open file or the files selected reach, which Shift+↑/↓ moves on from.
export function reachedFile(open: OpenFile | OpenFiles): string | undefined {
  return openPaths(open).at(-1);
}

// The files from one to another in the group's list, both included: just the file, if they're the
// same one.
function between(
  group: GroupName,
  listed: readonly string[],
  from: string,
  to: string,
): OpenFile | OpenFiles {
  if (from === to) {
    return { group, path: to };
  }

  const start = listed.indexOf(from);
  const end = listed.indexOf(to);
  // None if the files go up the list.
  const down = listed.slice(start, end + 1);

  return { group, paths: down.length > 0 ? down : listed.slice(end, start + 1).toReversed() };
}

// The file a selection in the group starts at and the one it reaches, from what's open: the open
// file, or the first and last of the files selected, while the group lists them.
function endsIn(
  open: Open | undefined,
  group: GroupName,
  listed: readonly string[],
): [string, string] | undefined {
  if (open?.group !== group) {
    return undefined;
  }

  const paths = openPaths(open);
  const start = listed.find((path) => path === paths[0]);
  const end = listed.find((path) => path === paths.at(-1));

  return start === undefined || end === undefined ? undefined : [start, end];
}

// What's open once the file, of those its group lists, is shift-clicked: the files from the open
// one, or from the one the selection starts at, to it. Just the file if neither is in its group.
export function selectedTo(
  open: Open | undefined,
  file: OpenFile,
  listed: readonly string[],
): OpenFile | OpenFiles {
  const [start] = endsIn(open, file.group, listed) ?? [file.path];

  return between(file.group, listed, start, file.path);
}

// What's open once Shift+↓ (1) or Shift+↑ (-1) is pressed with focus in the file's row, of those its
// group lists: the files from the open one, or from the one the selection starts at, to the file
// after or before the one it reaches, or else from the file with focus. Past either end of the list,
// what was.
export function selectedBy(
  open: Open | undefined,
  file: OpenFile,
  listed: readonly string[],
  step: 1 | -1,
): OpenFile | OpenFiles {
  const [start, end] = endsIn(open, file.group, listed) ?? [file.path, file.path];

  return between(file.group, listed, start, listed[listed.indexOf(end) + step] ?? end);
}

// What opens once ↓ (1) or ↑ (-1) is pressed with focus in the file's row: the file the sidebar
// lists after it or before it, from the files of one of its groups it shows them of to the next's.
// None past either end, or if the sidebar doesn't list the file.
export function listedBy(
  sidebar: readonly SidebarGroup[],
  collapsed: readonly GroupName[],
  file: OpenFile,
  step: 1 | -1,
): OpenFile | undefined {
  const listed = sidebar
    .filter(({ name }) => !collapsed.includes(name))
    .flatMap(({ name, paths }) => paths.map((path) => ({ group: name, path })));

  const index = listed.findIndex(({ group, path }) => group === file.group && path === file.path);

  return index === -1 ? undefined : listed[index + step];
}

// The files of the group's read that the sidebar lists under the filter, each with its diff or why
// it can't be read.
export function listedFiles(read: GroupRead, filter: string): GroupRead["files"] {
  return read.files.filter(({ path }) => matches(path, filter));
}

// The file's diff, if the group's read could read it.
export function diffOf(file: GroupRead["files"][number]): Diff | undefined {
  return "error" in file ? undefined : file;
}

// What's open of what was, once its group lists the files: the group, or the open file or all the
// files selected while it lists them, or else those of them it lists. None if it lists none of them.
function stillOpen(open: Open, listed: readonly string[]): Open | undefined {
  const paths = openPaths(open);
  const kept = paths.filter((path) => listed.includes(path));

  if (kept.length === paths.length) {
    return open;
  }

  const [first, ...rest] = kept;

  if (first === undefined) {
    return undefined;
  }

  return rest.length === 0
    ? { group: open.group, path: first }
    : { group: open.group, paths: kept };
}

// What opens once the changes are first listed, from what the tab showed before Paseo reloaded:
// what's still open of it, or else the first file the sidebar lists, as when nothing was shown.
function reopened(shown: Open | undefined, changes: Changes, hidden: Hidden): Open | undefined {
  return (
    (shown === undefined ? undefined : stillOpen(shown, changes[shown.group])) ??
    firstFile(changes, hidden)
  );
}

// The file of the group that opens once the files at the paths leave it, from its list before and
// after, of those the sidebar lists under the filter: the next file in the list before that it still
// lists, after the last of them, or else the closest one before it, or else the first one it lists
// now. None if it lists none. A group collapsed is moved on in all the same, as it hides its files
// only to tidy the sidebar, while the filter picks the files worked on.
function movedOn(
  group: GroupName,
  paths: readonly string[],
  previous: readonly string[],
  after: readonly string[],
  filter: string,
): OpenFile | undefined {
  const last = Math.max(...paths.map((path) => previous.indexOf(path)));
  const listed = after.filter((path) => matches(path, filter));

  // Searched after the files that follow the last one, which are gone by then, the reversed list
  // finds the closest one before it.
  const path = [...previous.slice(last + 1), ...previous.toReversed(), ...listed].find(
    (candidate) => listed.includes(candidate),
  );

  return path === undefined ? undefined : { group, path };
}

// What to show once the changes are listed, from what was open and the lists before, if they were
// listed before, and after. Once they're first listed, what's still open of what the tab showed
// before Paseo reloaded, or else the first file the sidebar lists, with what it hides hidden. After
// that, as after an action, the open group, or the open file or those of the files selected that
// its group still lists. Otherwise the next file in the group's list before that it still lists
// under the filter, after the last of them, or else the closest one before it, or else the first
// one it lists now. None if it lists none, or nothing was open.
export function openAfter(
  open: Open | undefined,
  before: Changes | undefined,
  after: Changes,
  hidden: Hidden,
): Open | undefined {
  if (before === undefined) {
    return reopened(open, after, hidden);
  }

  if (open === undefined) {
    return undefined;
  }

  const listed = after[open.group];
  const kept = stillOpen(open, listed);

  if (kept !== undefined) {
    return kept;
  }

  return movedOn(open.group, openPaths(open), before[open.group], listed, hidden.filter);
}

// The file that opens once the open file leaves its group, as after an action on it, whose diff is
// worth reading before then. None unless a file is open, not a group or files selected, and its
// group lists another under the filter.
export function fileAfter(
  open: Open | undefined,
  filter: string,
  changes?: Changes,
): OpenFile | undefined {
  if (open?.path === undefined || changes === undefined) {
    return undefined;
  }

  const { group, path } = open;
  const listed = changes[group];

  return movedOn(
    group,
    [path],
    listed,
    listed.filter((other) => other !== path),
    filter,
  );
}
