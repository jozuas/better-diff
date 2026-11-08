import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";
import type { TextRange } from "./changed-text";
import type { Unchanged } from "./lines";
import { lineId, unchangedLineId } from "./selection";

type Hunk = RpcOutput<typeof diffRpc>["hunks"][number];

// A match of what's typed in the find bar in a line's text, and whether it's the current match.
export interface FoundRange extends TextRange {
  current: boolean;
}

// The matches in a section's lines, by each line's index in the section.
export type FoundLines = ReadonlyMap<number, readonly FoundRange[]>;

// Whether finding the text matches only its case: with Match case on, or, as ripgrep's smart case
// has it, where the text has a capital letter.
function matchesCase(text: string, matchCase: boolean): boolean {
  return matchCase || text.toLowerCase() !== text;
}

// What a regular expression with the u flag reads as more than the character itself.
const syntax = /[$()*+.?[\\\]^{|}]/gu;

// Where the text is in a line: each place from the line's start, each after the one before, as a
// browser's find has them. Nowhere for no text.
export function finder(text: string, matchCase: boolean): (line: string) => TextRange[] {
  if (text === "") {
    return () => [];
  }

  const pattern = new RegExp(
    text.replaceAll(syntax, "\\$&"),
    matchesCase(text, matchCase) ? "gu" : "giu",
  );

  return (line) =>
    Array.from(line.matchAll(pattern), ({ index, 0: matched }) => ({
      start: index,
      end: index + matched.length,
    }));
}

// A file's diff is found in by sections, in the order they show: the unchanged lines before its
// first hunk, then each hunk's lines, and the unchanged lines after it, up to the next hunk. Those
// unchanged lines show only while the entire file does.
export const beforeSection = 0;

export function hunkSection(hunk: number): number {
  return 2 * hunk + 1;
}

export function afterSection(hunk: number): number {
  return 2 * hunk + 2;
}

// The texts of the lines of each of a file's sections.
export function sectionsOf(hunks: readonly Hunk[], unchanged: Unchanged): string[][] {
  return [
    unchanged.before.map(({ text }) => text),
    ...hunks.flatMap(({ lines }, hunk) => [
      lines.map(({ text }) => text),
      (unchanged.after[hunk] ?? []).map(({ text }) => text),
    ]),
  ];
}

// A line of a section: the id of its element, and for an unchanged one, its number in the new
// version, which the entire file renders the lines around.
interface SectionLine {
  id: string;
  newNumber: number | undefined;
}

// The line at the index in the section of the diff shown at the container, if it has one.
function sectionLine(
  container: string,
  unchanged: Unchanged,
  section: number,
  line: number,
): SectionLine | undefined {
  if (section % 2 === 1) {
    return { id: lineId(container, (section - 1) / 2, line), newNumber: undefined };
  }

  const shown = (section === beforeSection ? unchanged.before : unchanged.after[section / 2 - 1])?.[
    line
  ];

  return shown === undefined
    ? undefined
    : { id: unchangedLineId(container, shown), newNumber: shown.newNumber };
}

// How far to scroll a view `viewHeight` tall to show a line `lineHeight` tall, whose top is
// `offset` below the view's top, below the `margin` at its top that bars stuck there take: none if
// it shows there already, or else to the middle of the rest of the view.
export function revealDistance(
  offset: number,
  lineHeight: number,
  viewHeight: number,
  margin: number,
): number {
  if (offset >= margin && offset + lineHeight <= viewHeight) {
    return 0;
  }

  return offset - (margin + viewHeight - lineHeight) / 2;
}

// What a view shows of one of its files' diffs, as the find bar reads it.
export interface FindableFile {
  // The id of the view, and the file's index among its files.
  view: string;
  index: number;
  // The texts of the lines of each of its sections.
  sections: readonly (readonly string[])[];
  // Whether its diff is collapsed, its lines left out until they're asked for.
  collapsed: boolean;
  // Scrolls the view to show the line at the index in the section, in the middle of the view,
  // unless it shows it already.
  reveal: (section: number, line: number) => void;
  // How far below what stays at the top of the view the line's top is, while the page has it.
  offsetOf: (section: number, line: number) => number | undefined;
  // Whether the view shows the line whole, below what stays at its top.
  inView: (section: number, line: number) => boolean;
}

// A view's lines on the page, by their elements' ids.
export interface LinePage {
  // Scrolls the view to show the line below the `margin` at its top that bars stuck there take, in
  // the middle of the rest of the view, unless it shows there already. False if the page hasn't
  // the line.
  reveal: (id: string, margin: number) => boolean;
  // How far below the top of the view the line's top is, if the page has it.
  offsetOf: (id: string) => number | undefined;
  // Whether the view shows the line whole, below the `margin` at its top that bars stuck there
  // take. False if the page hasn't the line.
  inView: (id: string, margin: number) => boolean;
}

// What a diff at the container shows, in the view at the index among its files, as the find bar
// reads it.
export interface ShownLines {
  container: string;
  view: string;
  index: number;
  sections: readonly (readonly string[])[];
  // As they are when they're read: the unchanged lines it shows, and how far below the view's top
  // the bars stuck there reach.
  now: () => { unchanged: Unchanged; margin: number };
  // Renders the lines of the entire file around the line with the number in the new version, and
  // then shows the line with the id.
  showAround: (line: number, id: string) => void;
  page: LinePage;
}

// The diff's lines, as a file the find bar finds in. A line it shows that the page hasn't, as one of
// the entire file's that it hasn't rendered yet, is shown once the lines around it are rendered.
export function findableLines({
  container,
  view,
  index,
  sections,
  now,
  showAround,
  page,
}: ShownLines): FindableFile {
  return {
    view,
    index,
    sections,
    collapsed: false,
    reveal: (section, line) => {
      const { unchanged, margin } = now();
      const shown = sectionLine(container, unchanged, section, line);

      if (shown !== undefined && !page.reveal(shown.id, margin) && shown.newNumber !== undefined) {
        showAround(shown.newNumber, shown.id);
      }
    },
    offsetOf: (section, line) => {
      const { unchanged, margin } = now();
      const shown = sectionLine(container, unchanged, section, line);
      const offset = shown === undefined ? undefined : page.offsetOf(shown.id);

      return offset === undefined ? undefined : offset - margin;
    },
    inView: (section, line) => {
      const { unchanged, margin } = now();
      const shown = sectionLine(container, unchanged, section, line);

      return shown !== undefined && page.inView(shown.id, margin);
    },
  };
}

// A collapsed diff in the view at the index among its files, as a file the find bar counts among
// those it doesn't find in.
export function collapsedFile(view: string, index: number): FindableFile {
  return {
    view,
    index,
    sections: [],
    collapsed: true,
    reveal: () => {},
    offsetOf: () => {},
    inView: () => false,
  };
}
