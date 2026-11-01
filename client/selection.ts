import type { RpcInput } from "@getpaseo/plugin";

import type { applyLinesRpc } from "../shared/diff";

type Lines = RpcInput<typeof applyLinesRpc>["lines"];

type Line = Lines[number];

// Lines of one hunk, from the first to the last, by their indices in it.
export interface LineRange {
  hunk: number;
  first: number;
  last: number;
}

// A line's element id, under the id of the element the diff's lines are in.
export function lineId(container: string, hunk: number, line: number): string {
  return `${container}:${hunk}:${line}`;
}

// The line an element id names, if it's one of the container's lines.
function lineOf(container: string, id: string): Line[] {
  const groups = /^(?<hunk>\d+):(?<line>\d+)$/u.exec(id.slice(container.length + 1))?.groups;

  return id.startsWith(`${container}:`) && groups !== undefined
    ? [{ hunk: Number(groups["hunk"]), line: Number(groups["line"]) }]
    : [];
}

// The lines a selection touches, from the ids of the elements it touches and of the one it starts
// in, which needn't be a line: those of the hunk it starts in, if it touches any, or else of the
// first one it touches, so that it stays within one hunk. Undefined if it touches no line.
export function selectedRange(
  container: string,
  touched: readonly string[],
  anchor: string,
): LineRange | undefined {
  const lines = touched.flatMap((id) => lineOf(container, id));
  const [started] = lineOf(container, anchor);
  const hunk = (lines.find((line) => line.hunk === started?.hunk) ?? lines[0])?.hunk;
  const indices = lines.flatMap(({ hunk: other, line }) => (other === hunk ? [line] : []));

  return hunk === undefined
    ? undefined
    : { hunk, first: Math.min(...indices), last: Math.max(...indices) };
}

export function sameRange(range: LineRange | undefined, other: LineRange | undefined): boolean {
  return (
    range?.hunk === other?.hunk && range?.first === other?.first && range?.last === other?.last
  );
}

export function isSelected(range: LineRange | undefined, hunk: number, line: number): boolean {
  return range?.hunk === hunk && line >= range.first && line <= range.last;
}

// The range's lines, as an action on lines names them.
export function rangeLines({ hunk, first, last }: LineRange): Lines {
  return Array.from({ length: last - first + 1 }, (_, index) => ({ hunk, line: first + index }));
}
