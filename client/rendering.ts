import type { RpcOutput } from "@getpaseo/plugin";

import type { groupRpc } from "../shared/diff";
import type { NumberedLine } from "./lines";
import { linesTall, rowTall } from "./side-by-side";
import type { Row } from "./side-by-side";

type GroupFile = RpcOutput<typeof groupRpc>["files"][number];

// How many lines a file's diff shows as the group's read has it: its hunks' lines, or one for what
// shows in their place.
export function linesShown(file: GroupFile): number {
  let lines = 0;

  for (const hunk of "error" in file ? [] : file.hunks) {
    lines += hunk.lines.length;
  }

  return Math.max(1, lines);
}

// How many of a view's files, from the first, to render the diffs of, by how many lines each shows,
// once `rendered` of them are: one more, and more until those added show `budget` lines, or all.
export function filesToRender(lines: readonly number[], rendered: number, budget: number): number {
  let next = rendered;
  let added = 0;

  while (next < lines.length && added < budget) {
    added += lines[next] ?? 0;
    next += 1;
  }

  return next;
}

// How many of a view's files, from the first, to render the diffs of once the files `before` lists,
// of which `rendered` from the first are, are those `after` lists: as many as before, or more where
// it takes more for each of those to still be, as once a file joins above them.
export function stillRendered(
  before: readonly Pick<GroupFile, "path">[],
  rendered: number,
  after: readonly Pick<GroupFile, "path">[],
): number {
  const places = new Map(after.map(({ path }, index) => [path, index + 1]));
  let still = rendered;

  for (const { path } of before.slice(0, rendered)) {
    still = Math.max(still, places.get(path) ?? 0);
  }

  return still;
}

// Where a block of rows starts, and where it ends, after its last row.
export interface Block {
  start: number;
  end: number;
}

// The rows in blocks of `size` rows, the last with what's left.
export function blocksOfRows(rows: number, size: number): Block[] {
  return Array.from({ length: Math.ceil(rows / size) }, (_, index) => ({
    start: index * size,
    end: Math.min(rows, (index + 1) * size),
  }));
}

// The lines of a file's new version that a view of the entire file renders, by their numbers, from
// the first to the last, which can be past either end of the file. The rest render later.
export interface LineWindow {
  first: number;
  last: number;
}

// The window of `lines` lines around the line, from half of them before it.
export function windowAround(line: number, lines: number): LineWindow {
  const first = line - Math.floor(lines / 2);

  return { first, last: first + lines - 1 };
}

// The window's lines the version of `total` lines has, from the first to the last: none, between
// them, if it has none of them.
function within({ first, last }: LineWindow, total: number): LineWindow {
  const start = Math.min(Math.max(first, 1), total + 1);

  return { first: start, last: Math.max(Math.min(last, total), start - 1) };
}

// Whether the window has all `total` of the version's lines.
export function covers(window: LineWindow, total: number): boolean {
  const { first, last } = within(window, total);

  return first === 1 && last === total;
}

// The window's lines the version has, with up to `more` more of them: half before them and half
// after, and on one side the part the other side has run out of lines for.
export function widened(window: LineWindow, total: number, more: number): LineWindow {
  const { first, last } = within(window, total);
  const roomAfter = total - last;
  const before = Math.min(first - 1, Math.max(Math.floor(more / 2), more - roomAfter));
  const after = Math.min(roomAfter, more - before);

  return { first: first - before, last: last + after };
}

// Whether some of the lines from the first to the last are in the window.
function inWindow(window: LineWindow, first: number, last: number): boolean {
  return last >= window.first && first <= window.last;
}

// Whether to render the block of the lines, rather than the room they take: while there's no window,
// or some of its lines are in it, by their numbers in the new version.
export function rendersBlock(
  window: LineWindow | undefined,
  lines: readonly { newNumber: number | undefined }[],
  { start, end }: Block,
): boolean {
  const numbers = lines.slice(start, end).map(({ newNumber }) => newNumber ?? 0);

  return window === undefined || inWindow(window, Math.min(...numbers), Math.max(...numbers));
}

// How many lines tall the block of the lines shows, inline, or of their rows side by side.
export function blockTall(
  lines: readonly NumberedLine[],
  rows: readonly Row[] | undefined,
  { start, end }: Block,
): number {
  const tall =
    rows === undefined
      ? lines.slice(start, end).map(linesTall)
      : rows.slice(start, end).map(rowTall);

  return tall.reduce((sum, each) => sum + each, 0);
}
