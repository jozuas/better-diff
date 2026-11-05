import type { RpcOutput } from "@getpaseo/plugin";
import { createContext } from "react";

import type { diffRpc } from "../shared/diff";
import type { syntaxColorsRpc } from "../shared/syntax";
import type { TextRange } from "./changed-text";

type Runs = RpcOutput<typeof diffRpc>["contents"][number]["runs"];

type Scheme = keyof RpcOutput<typeof syntaxColorsRpc>;

// The colour of each style, by its name.
export type SyntaxColors = Readonly<Record<string, string>>;

// The colours for the panel's theme, none until they're read.
export const SyntaxColorsContext = createContext<SyntaxColors>({});

// What a piece of a line's text is marked as: changed text, or the whitespace an added line ends
// with.
export type Mark = "changed" | "trailing whitespace";

// A piece of a line's text, where it starts in the text, the colour of its style, or undefined for
// the text's own colour, and what it's marked as, if anything.
export interface Segment {
  start: number;
  text: string;
  color: string | undefined;
  mark: Mark | undefined;
}

// What's the same throughout a piece of a line's text, from where the piece before it ends up to
// where it ends.
interface Span<Value> {
  end: number;
  value: Value;
}

// The colour of each run's text: its style's, or undefined for the text's own where the style has
// none.
function colorSpans(runs: Runs, colors: SyntaxColors): Span<string | undefined>[] {
  let end = 0;

  return runs.map(([length, style]) => {
    end += length;

    return { end, value: style === null ? undefined : colors[style] };
  });
}

// What the text is marked as up to where its trailing whitespace starts: nothing up to where each
// range of changed text starts, then changed up to where it ends. Past them, it's trailing
// whitespace.
function markSpans(changes: readonly TextRange[], trailing: number): Span<Mark | undefined>[] {
  return [
    ...changes.flatMap(({ start, end }) => [
      { end: Math.min(start, trailing), value: undefined },
      { end: Math.min(end, trailing), value: "changed" as const },
    ]),
    { end: trailing, value: undefined },
  ];
}

// The text in pieces of different colours, each run's in its style's, and any text the runs don't
// reach in its own, split where changed text and the trailing whitespace from `trailing` start and
// end.
export function segmentsOf(
  text: string,
  runs: Runs,
  colors: SyntaxColors,
  changes: readonly TextRange[],
  trailing: number,
): Segment[] {
  const colored = colorSpans(runs, colors);
  const marked = markSpans(changes, trailing);
  const segments: Segment[] = [];
  let start = 0;
  let colorIndex = 0;
  let markIndex = 0;

  while (start < text.length) {
    const color = colored[colorIndex] ?? { end: text.length, value: undefined };
    const mark = marked[markIndex] ?? { end: text.length, value: "trailing whitespace" };
    const end = Math.min(color.end, mark.end);
    const piece = text.slice(start, end);
    const last = segments.at(-1);

    if (last !== undefined && last.color === color.value && last.mark === mark.value) {
      last.text += piece;
    } else if (piece.length > 0) {
      segments.push({ start, text: piece, color: color.value, mark: mark.value });
    }

    start = end;

    if (color.end === end) {
      colorIndex += 1;
    }

    if (mark.end === end) {
      markIndex += 1;
    }
  }

  return segments;
}

// The colour's red, green or blue, from 0 to 255, by where its two digits start in #rrggbb.
function channel(color: string, start: number): number {
  return Number.parseInt(color.slice(start, start + 2), 16);
}

// Whether a theme whose background is the colour, as #rrggbb, is light or dark: light if the colour
// looks at least as bright as middle grey, #808080, weighing its red, green and blue as the eye does.
export function schemeOf(background: string): Scheme {
  const brightness =
    299 * channel(background, 1) + 587 * channel(background, 3) + 114 * channel(background, 5);

  return brightness >= 128_000 ? "light" : "dark";
}
