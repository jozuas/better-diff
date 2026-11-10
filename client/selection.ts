import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import type { applyLinesRpc, diffRpc } from "../shared/diff";
import type { NumberedLine } from "./lines";
import { shows } from "./side-by-side";
import type { Focus, Side } from "./side-by-side";

type Lines = RpcInput<typeof applyLinesRpc>["lines"];

type HunkLine = RpcOutput<typeof diffRpc>["hunks"][number]["lines"][number];

// A line of one of a view's files, by the file's index in the view, its hunk's index in the file's
// diff and its own index in the hunk.
interface Line {
  file: number;
  hunk: number;
  line: number;
}

// Lines of one hunk of one of a view's files, from the first to the last, by their indices in it. In
// a side-by-side view, they're on one side, and the range has only the lines it shows.
export interface LineRange {
  file: number;
  hunk: number;
  first: number;
  last: number;
  side?: Side;
}

// The id of a view's file, by its index in the view, which its lines' ids start with and which no
// line has.
export function fileId(view: string, file: number): string {
  return `${view}:${file}`;
}

// Side by side, the element id of a line on the side without focus, from the one it has on the side
// with focus: one by which a selection doesn't find it.
export function unfocusedId(id: string): string {
  return `${id}:unfocused`;
}

// The element id a line has on the side with focus, from the one it has on either side.
export function focusedId(id: string): string {
  return id.replace(/:unfocused$/u, "");
}

// A line's element id, under its file's id.
export function lineId(file: string, hunk: number, line: number, focused = true): string {
  const id = `${file}:${hunk}:${line}`;

  return focused ? id : unfocusedId(id);
}

// The element id of a line outside the hunks, under its file's id, by its number in the new
// version: no hunk's line has it, so a selection leaves the line out of those it selects.
export function unchangedLineId(file: string, { newNumber }: NumberedLine, focused = true): string {
  const id = `${file}:new ${String(newNumber)}`;

  return focused ? id : unfocusedId(id);
}

// The id of an element at the top of a hunk's lines, by which the view finds the hunk, whichever of
// its lines have ids.
export function hunkId(file: string, hunk: number): string {
  return `${file}:${hunk}`;
}

// The line an element id names, if it's one of the view's lines.
function lineOf(view: string, id: string): Line[] {
  const groups = /^(?<file>\d+):(?<hunk>\d+):(?<line>\d+)$/u.exec(
    id.slice(view.length + 1),
  )?.groups;

  return id.startsWith(`${view}:`) && groups !== undefined
    ? [{ file: Number(groups["file"]), hunk: Number(groups["hunk"]), line: Number(groups["line"]) }]
    : [];
}

function sameHunk(line: Line, other: Line | undefined): boolean {
  return other !== undefined && line.file === other.file && line.hunk === other.hunk;
}

// The lines of a view's files a selection touches, from the ids of the elements it touches and of
// the one it starts in, which needn't be a line: those of the hunk it starts in, if it touches any,
// or else of the first one it touches, so that it stays within one hunk of one file. Undefined if
// it touches no line.
export function selectedRange(
  view: string,
  touched: readonly string[],
  anchor: string,
): LineRange | undefined {
  const lines = touched.flatMap((id) => lineOf(view, id));
  const [started] = lineOf(view, anchor);
  const kept = lines.find((line) => sameHunk(line, started)) ?? lines[0];
  const indices = lines.flatMap((line) => (sameHunk(line, kept) ? [line.line] : []));

  return kept === undefined
    ? undefined
    : { file: kept.file, hunk: kept.hunk, first: Math.min(...indices), last: Math.max(...indices) };
}

function sameRange(range: LineRange, other: LineRange): boolean {
  return (
    range.file === other.file &&
    range.hunk === other.hunk &&
    range.first === other.first &&
    range.last === other.last
  );
}

// What a view shows of each of its files, by the file's index in the view: what names the diff it
// shows, such as the file's path and the diff's version, or undefined where it shows none.
export type ShownFiles = (file: number) => string | undefined;

// The lines a selection touched while the file they're in showed what `shown` names.
export interface SelectedLines {
  range: LineRange;
  shown: string | undefined;
}

// What's selected of the view's lines, from the range the selection touches as the view shows its
// files: what was before if that's the same.
export function selectedLines(
  before: SelectedLines | undefined,
  range: LineRange | undefined,
  shown: ShownFiles,
): SelectedLines | undefined {
  if (range === undefined) {
    return undefined;
  }

  const now = shown(range.file);

  return before !== undefined && before.shown === now && sameRange(before.range, range)
    ? before
    : { range, shown: now };
}

// The selected lines, while the file they're in shows what it did when they were selected. Once it
// shows something else, none: the lines the selection touches then can be others.
export function stillSelected(
  selected: SelectedLines | undefined,
  shown: ShownFiles,
): LineRange | undefined {
  return selected !== undefined && shown(selected.range.file) === selected.shown
    ? selected.range
    : undefined;
}

// The range, on the side with focus, in a side-by-side view.
export function onSide(range: LineRange | undefined, focus?: Focus): LineRange | undefined {
  return range === undefined || focus === undefined ? range : { ...range, side: focus.side };
}

// Tells the range apart from the others of its hunk.
export function rangeKey({ first, last, side }: LineRange): string {
  return `${first}-${last} ${String(side)}`;
}

// The range, if it's of the view's file at the index.
export function rangeIn(range: LineRange | undefined, file: number): LineRange | undefined {
  return range?.file === file ? range : undefined;
}

// The range, if it's of the file's hunk at the index, the same as it is.
export function rangeInHunk(range: LineRange | undefined, hunk: number): LineRange | undefined {
  return range?.hunk === hunk ? range : undefined;
}

// The range, on the side with focus in a side-by-side view, if it's of the hunk at the index of the
// view's file at the index `file`.
export function selectedInHunk(
  range: LineRange | undefined,
  focus: Focus | undefined,
  file: number,
  hunk: number,
): LineRange | undefined {
  return rangeInHunk(rangeIn(onSide(range, focus), file), hunk);
}

// The index of the hunk whose lines the range has, if it's of the view's file at the index `file`,
// and another than the hunk at the index `own`, if any.
export function otherHunk(
  range: LineRange | undefined,
  file: number,
  own?: number,
): number | undefined {
  return range?.file === file && range.hunk !== own ? range.hunk : undefined;
}

// Whether the range has the line of its file, as shown on the side, in a side-by-side view.
export function isSelected(
  range: LineRange | undefined,
  hunk: number,
  line: number,
  side?: Side,
): boolean {
  return range?.hunk === hunk && line >= range.first && line <= range.last && range.side === side;
}

// The range's lines, as an action on its file's lines names them, from those of its hunk.
export function rangeLines(
  { hunk, first, last, side }: LineRange,
  lines: readonly HunkLine[],
): Lines {
  return lines.flatMap(({ kind }, line) =>
    line >= first && line <= last && shows(side, kind) ? [{ hunk, line }] : [],
  );
}
