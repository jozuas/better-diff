import { reachedFile } from "./groups";
import type { GroupName, Open, OpenFile, SidebarGroup } from "./groups";

// A place in the sidebar that keys move focus to: a group's heading, without a path, or a file's
// row.
export interface SidebarStop {
  group: GroupName;
  path?: string | undefined;
}

// The sidebar's headings and rows, in order: each group's heading, and the rows of the files it
// lists under it, while it's expanded.
export function sidebarStops(
  sidebar: readonly SidebarGroup[],
  collapsed: readonly GroupName[],
): SidebarStop[] {
  return sidebar.flatMap(({ name, paths }) => [
    { group: name },
    ...(collapsed.includes(name) ? [] : paths.map((path) => ({ group: name, path }))),
  ]);
}

function same(stop: SidebarStop, other: SidebarStop): boolean {
  return stop.group === other.group && stop.path === other.path;
}

export function indexOfStop(stops: readonly SidebarStop[], stop: SidebarStop): number {
  return stops.findIndex((other) => same(other, stop));
}

function isHeading({ path }: SidebarStop): boolean {
  return path === undefined;
}

// The stop after the one given, 1, or before it, -1, or with `headings`, the next heading after it
// or the one before. None past either end, or from a stop the sidebar doesn't have.
export function stopBy(
  stops: readonly SidebarStop[],
  from: SidebarStop,
  step: 1 | -1,
  headings = false,
): SidebarStop | undefined {
  const index = indexOfStop(stops, from);

  if (index === -1) {
    return undefined;
  }

  if (!headings) {
    return stops[index + step];
  }

  return step === 1
    ? stops.slice(index + 1).find(isHeading)
    : stops.slice(0, index).findLast(isHeading);
}

// The first file the sidebar lists, if any.
export function firstRow(stops: readonly SidebarStop[]): OpenFile | undefined {
  const [first] = stops.flatMap(({ group, path }) => (path === undefined ? [] : [{ group, path }]));

  return first;
}

// The stop that takes the place of the one that was at the index once the sidebar has these: the
// one at the index now, or else the last.
export function stopInPlace(stops: readonly SidebarStop[], index: number): SidebarStop | undefined {
  return stops[Math.min(index, stops.length - 1)];
}

// The stop of what's open: the open file's row, the row of the file the files selected reach, or the
// open group's heading.
export function openStop(open: Open | undefined): SidebarStop | undefined {
  if (open === undefined) {
    return undefined;
  }

  return "paths" in open || open.path !== undefined
    ? { group: open.group, path: reachedFile(open) }
    : { group: open.group };
}

// The row of the open file, or of the file the files selected reach, while the sidebar has it.
export function openRow(
  stops: readonly SidebarStop[],
  open: Open | undefined,
): SidebarStop | undefined {
  const stop = openStop(open);

  return stop?.path !== undefined && indexOfStop(stops, stop) !== -1 ? stop : undefined;
}
