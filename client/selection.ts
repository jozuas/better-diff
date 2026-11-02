import type { RpcInput } from "@getpaseo/plugin";

import type { applyLinesRpc } from "../shared/diff";

type Lines = RpcInput<typeof applyLinesRpc>["lines"];

// A line of one of a view's files, by the file's index in the view, its hunk's index in the file's
// diff and its own index in the hunk.
interface Line {
  file: number;
  hunk: number;
  line: number;
}

// Lines of one hunk of one of a view's files, from the first to the last, by their indices in it.
export interface LineRange {
  file: number;
  hunk: number;
  first: number;
  last: number;
}

// The id of a view's file, by its index in the view, which its lines' ids start with and which no
// line has.
export function fileId(view: string, file: number): string {
  return `${view}:${file}`;
}

// A line's element id, under its file's id.
export function lineId(file: string, hunk: number, line: number): string {
  return `${file}:${hunk}:${line}`;
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

export function sameRange(range: LineRange | undefined, other: LineRange | undefined): boolean {
  return (
    range?.file === other?.file &&
    range?.hunk === other?.hunk &&
    range?.first === other?.first &&
    range?.last === other?.last
  );
}

// The range, if it's of the view's file at the index.
export function rangeIn(range: LineRange | undefined, file: number): LineRange | undefined {
  return range?.file === file ? range : undefined;
}

// Whether the range has the line of its file.
export function isSelected(range: LineRange | undefined, hunk: number, line: number): boolean {
  return range?.hunk === hunk && line >= range.first && line <= range.last;
}

// The range's lines, as an action on its file's lines names them.
export function rangeLines({ hunk, first, last }: LineRange): Lines {
  return Array.from({ length: last - first + 1 }, (_, index) => ({ hunk, line: first + index }));
}
