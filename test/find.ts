import * as fc from "fast-check";

import type { TextRange } from "../client/changed-text";
import type { FoundLines } from "../client/find";
import { findStore } from "../client/find-store";
import type { Find } from "../client/find-store";
import type { NumberedLine, Unchanged } from "../client/lines";
import { hunkLines } from "./hunk-lines";

// Each place the text, which isn't empty, is in the line, from the start, each after the one
// before, as indexOf finds them.
export function placesOf(line: string, text: string): TextRange[] {
  const places: TextRange[] = [];
  let at = line.indexOf(text);

  while (at !== -1) {
    places.push({ start: at, end: at + text.length });
    at = line.indexOf(text, at + text.length);
  }

  return places;
}

// What a test's view shows of a file: its index among the view's files, its sections' lines,
// whether it's collapsed, and how far below what stays at the top of the view each line's top is,
// by section, where the page has it. The view shows a line whose top is at or below what stays at
// its top, and every line of a file without offsets.
export interface Shown {
  index: number;
  sections: readonly (readonly string[])[];
  collapsed?: boolean;
  offsets?: readonly (readonly (number | undefined)[])[];
}

// A line a view showed, by its file's index, its section and its index in the section.
export interface LineShown {
  index: number;
  section: number;
  line: number;
}

// Where a match is, by its line and where it is in the line.
export interface Place extends LineShown, TextRange {}

export interface TestView {
  find: Find;
  // The lines the view showed, in order.
  revealed: LineShown[];
  // Shows the file in the view with the id, until the returned function is called.
  add: (shown: Shown, view?: string) => () => void;
}

export function testView(): TestView {
  const find = findStore();
  const revealed: LineShown[] = [];

  return {
    find,
    revealed,
    add: (shown, view = "view") =>
      find.add(`${view}:${String(shown.index)}`, {
        view,
        index: shown.index,
        sections: shown.sections,
        collapsed: shown.collapsed ?? false,
        reveal: (section, line) => {
          revealed.push({ index: shown.index, section, line });
        },
        offsetOf: (section, line) => shown.offsets?.[section]?.[line],
        inView: (section, line) =>
          shown.offsets === undefined || (shown.offsets[section]?.[line] ?? -1) >= 0,
      }),
  };
}

// Shows the files in the view, and opens the find bar on the text.
export function searched(files: readonly Shown[], text: string): TestView {
  const view = testView();

  for (const file of files) {
    view.add(file);
  }

  view.find.open();
  view.find.search(text);

  return view;
}

// Moves from the current match `times` times, by `by`.
export function stepTimes(find: Find, by: 1 | -1, times: number): void {
  for (let step = 0; step < times; step += 1) {
    find.step(by);
  }
}

// Where the text is in the files, in the order they show.
export function placesIn(files: readonly Shown[], text: string): Place[] {
  return files
    .toSorted((one, other) => one.index - other.index)
    .flatMap(({ index, sections }) =>
      sections.flatMap((sectionLines, section) =>
        sectionLines.flatMap((line, at) =>
          placesOf(line, text).map(({ start, end }) => ({ start, end, index, section, line: at })),
        ),
      ),
    );
}

// The lines of the places.
export function linesOf(places: readonly Place[]): LineShown[] {
  return places.map(({ index, section, line }) => ({ index, section, line }));
}

// The line of the place at the index, if there's one.
export function lineAt(places: readonly Place[], index: number | undefined): LineShown[] {
  return index === undefined ? [] : linesOf(places.slice(index, index + 1));
}

// The current match, if there's one.
export function currentOf(find: Find, places: readonly Place[]): Place | undefined {
  return places[find.state().current ?? places.length];
}

// Whether the place shows before the other.
function before(place: Place, other: Place): boolean {
  const keys = ["index", "section", "line", "start"] as const;
  const differing = keys.find((key) => place[key] !== other[key]);

  return differing !== undefined && place[differing] < other[differing];
}

// The index of the first place, while there are any.
export function firstOf(places: readonly Place[]): number | undefined {
  return places.length === 0 ? undefined : 0;
}

// The index of the first of the places at or after the one given, or else the first, while there
// are any.
export function firstFrom(places: readonly Place[], from: Place | undefined): number | undefined {
  if (places.length === 0) {
    return undefined;
  }

  return from === undefined
    ? 0
    : Math.max(
        0,
        places.findIndex((place) => !before(place, from)),
      );
}

// The index of the first place whose line's top is at or below what stays at the top of the view,
// in the files with their offsets, or else the first's, while there are any.
export function firstAtTop(files: readonly Shown[], places: readonly Place[]): number | undefined {
  const offsets = new Map(files.map(({ index, offsets: those }) => [index, those]));

  const top = places.findIndex(
    ({ index, section, line }) => (offsets.get(index)?.[section]?.[line] ?? -1) >= 0,
  );

  return places.length === 0 ? undefined : Math.max(0, top);
}

// The index of the first of the places at or after the one that was current, while the view shows
// it, in the files with their offsets, or else of the first at or after the top of the view, while
// there are any.
export function firstTypedFrom(
  files: readonly Shown[],
  places: readonly Place[],
  was: Place | undefined,
): number | undefined {
  const offsets = new Map(files.map(({ index, offsets: those }) => [index, those]));

  const shown = was !== undefined && (offsets.get(was.index)?.[was.section]?.[was.line] ?? -1) >= 0;

  return shown ? firstFrom(places, was) : firstAtTop(files, places);
}

// Each section of each of the files, by the id of the file's diff and the section's index.
export function sectionsIn(files: readonly Shown[]): [string, number][] {
  return files.flatMap(({ index, sections }) =>
    sections.map((_, section): [string, number] => [`view:${String(index)}`, section]),
  );
}

// What the find bar finds of the text in each section of each of the files, with the current match
// marked.
export function foundIn(
  files: readonly Shown[],
  text: string,
  current: Place | undefined,
): FoundLines[] {
  return files.flatMap(({ index, sections }) =>
    sections.map(
      (sectionLines, section) =>
        new Map(
          sectionLines.flatMap((line, at) => {
            const ranges = placesOf(line, text).map(({ start, end }) => ({
              start,
              end,
              current:
                current?.index === index &&
                current.section === section &&
                current.line === at &&
                current.start === start,
            }));

            return ranges.length === 0 ? [] : [[at, ranges] as const];
          }),
        ),
    ),
  );
}

// The files, with how far below the top of the view each line the page has is, each line `tall`
// pixels tall, in the order they show, scrolled down `scroll` pixels, where `rendered` doesn't say
// the page hasn't it.
export function withOffsets(
  files: readonly Shown[],
  scroll: number,
  rendered: readonly boolean[],
  tall: number,
): Shown[] {
  let row = 0;

  return files
    .toSorted((one, other) => one.index - other.index)
    .map(({ index, sections }) => ({
      index,
      sections,
      offsets: sections.map((sectionLines) =>
        sectionLines.map(() => {
          const offset = (rendered[row] ?? true) ? row * tall - scroll : undefined;

          row += 1;

          return offset;
        }),
      ),
    }));
}

// Lines without capital letters, which text without them then matches whatever the case, with the
// text often in them, in more than one place.
const storeLine = fc
  .array(fc.constantFrom("a", "b", "ab", " ", "é"), { maxLength: 5 })
  .map((parts) => parts.join(""));

export const storeText = fc.constantFrom("a", "b", "ab", "é", "ba", "c");

// Files a view shows, each at its index among its files, in the order they're added.
export const shownFiles: fc.Arbitrary<Shown[]> = fc
  .array(fc.array(fc.array(storeLine, { maxLength: 4 }), { maxLength: 4 }), { maxLength: 4 })
  .chain((files) =>
    fc.shuffledSubarray(
      files.map((sections, index) => ({ index, sections })),
      { minLength: files.length, maxLength: files.length },
    ),
  );

// Files a view shows, how far down it's scrolled, in pixels, and which lines the page has, in the
// order they show.
export const scrolledFiles = fc.record({
  files: shownFiles,
  scroll: fc.integer({ min: 0, max: 300 }),
  rendered: fc.array(fc.boolean(), { maxLength: 40 }),
});

// Hunks, where they start in each version, and their lines.
export type Hunks = { oldStart: number; newStart: number; lines: NumberedLine[] }[];

// Hunks, with lines of every kind, and unchanged lines before them and after some of them, or more
// lists of those than there are hunks, numbered anyhow.
export const hunksAndUnchanged: fc.Arbitrary<{ hunks: Hunks; unchanged: Unchanged }> = fc.record({
  hunks: fc
    .array(hunkLines, { maxLength: 3 })
    .map((hunks) =>
      hunks.map((hunk, index) => ({ oldStart: index, newStart: index, lines: hunk })),
    ),
  unchanged: fc.record({ before: hunkLines, after: fc.array(hunkLines, { maxLength: 4 }) }),
});

// The lines of each section, in order: each unchanged one, and for each of a hunk's lines, null.
export function sectionLinesOf(hunks: Hunks, unchanged: Unchanged): (NumberedLine | null)[][] {
  return [
    unchanged.before,
    ...hunks.flatMap(({ lines: hunk }, index) => [
      hunk.map(() => null),
      unchanged.after[index] ?? [],
    ]),
  ];
}
