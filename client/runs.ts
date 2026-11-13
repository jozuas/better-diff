import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";
import type { NumberedLine, RunShown, Unchanged } from "./lines";

type Hunk = RpcOutput<typeof diffRpc>["hunks"][number];

// Where a hunk starts in each version of the file.
type Place = Pick<Hunk, "oldStart" | "newStart">;

// A hunk's place, and whether the run of unchanged lines above it, after the hunk before it, if
// any, shows.
interface Run extends Place {
  open: boolean;
}

// Which of a file's runs of unchanged lines show: all of them, as while the entire file shows, and
// else those of the hunks' runs that are open, which the hunks were at the places of when last read.
export interface ShownRuns {
  entire: boolean;
  runs: readonly Run[];
}

type Version = keyof Place;

// How many of the hunks start in the version where hunks did before.
function startingAsBefore(before: readonly Run[], hunks: readonly Place[], version: Version) {
  const starts = new Set(before.map((run) => run[version]));

  return hunks.filter((hunk) => starts.has(hunk[version])).length;
}

// The version the hunks start in where they did before, as only the other one changed: staging a
// hunk changes only the index, and an agent's changes only the worktree. The one where more of them
// do, or else the old version, which a change to the worktree leaves as it was.
function keptVersion(before: readonly Run[], hunks: readonly Place[]): Version {
  return startingAsBefore(before, hunks, "newStart") > startingAsBefore(before, hunks, "oldStart")
    ? "newStart"
    : "oldStart";
}

// What's shown of the file's runs of unchanged lines once its hunks are those, which were before as
// `shown` has them: each hunk's run is open while the hunk starts where an open one did in the
// version where they start as before, so it stays open as other hunks are staged or discarded, or
// lines are added or removed above it.
export function carriedTo(shown: ShownRuns, hunks: readonly Place[]): ShownRuns {
  const version = keptVersion(shown.runs, hunks);
  const open = new Set(shown.runs.filter((run) => run.open).map((run) => run[version]));

  return {
    entire: shown.entire,
    runs: hunks.map(({ oldStart, newStart }) => ({
      oldStart,
      newStart,
      open: open.has({ oldStart, newStart }[version]),
    })),
  };
}

// What's shown of the runs of unchanged lines around the hunks they were carried over to last.
export interface CarriedRuns<Hunks extends readonly Place[]> {
  hunks: Hunks;
  shown: ShownRuns;
}

// The runs carried over to the hunks, or as they are while those are the hunks they were carried
// over to last, so that what's rendered with them isn't rendered again.
export function carriedOver<Hunks extends readonly Place[]>(
  runs: CarriedRuns<Hunks>,
  hunks: Hunks,
): CarriedRuns<Hunks> {
  return runs.hunks === hunks ? runs : { hunks, shown: carriedTo(runs.shown, hunks) };
}

// Shows the run above the hunk at the index, too.
export function openedAbove(shown: ShownRuns, index: number): ShownRuns {
  return {
    entire: shown.entire,
    runs: shown.runs.map((run, at) => (at === index ? { ...run, open: true } : run)),
  };
}

// Hides the run above the hunk at the index. While the entire file shows, the runs above the other
// hunks stay shown, but not the lines after the last hunk, which show only with the entire file.
export function closedAbove(shown: ShownRuns, index: number): ShownRuns {
  return {
    entire: false,
    runs: shown.runs.map((run, at) => ({
      ...run,
      open: at !== index && (shown.entire || run.open),
    })),
  };
}

// Shows the entire file, or while it shows, none of the unchanged lines.
export function toggledEntire(shown: ShownRuns): ShownRuns {
  return {
    entire: !shown.entire,
    runs: shown.entire ? shown.runs.map((run) => ({ ...run, open: false })) : shown.runs,
  };
}

// What showing or hiding a run of unchanged lines does, by how it shows: shows it while it's hidden,
// and hides it while it's open, but not while a comment keeps it shown.
const actions = { hidden: "open", open: "close", kept: undefined } as const;

// What showing or hiding the run of `unchanged` lines above a hunk does, by how it shows, and
// nothing where there's none.
export function unchangedAction(unchanged: number, shown: RunShown): "open" | "close" | undefined {
  return unchanged === 0 ? undefined : actions[shown];
}

// None of the runs of unchanged lines.
const noRuns: ReadonlySet<number> = new Set();

// Whether the run of unchanged lines above the hunk at the index shows: while it's open, or the
// entire file shows, or it's one of those commented on, by index, the run before the first hunk at
// 0, and the one after the hunk at an index at the next.
function showsAbove(
  shown: ShownRuns,
  index: number,
  commented: ReadonlySet<number> = noRuns,
): boolean {
  return shown.entire || shown.runs[index]?.open === true || commented.has(index);
}

// How the run of unchanged lines above the hunk at the index shows, of the runs `commented` says
// have a line commented on: kept shown by the comment, open, as while the entire file shows, or
// hidden.
export function runShown(
  shown: ShownRuns,
  index: number,
  commented: ReadonlySet<number>,
): RunShown {
  if (commented.has(index)) {
    return "kept";
  }

  return showsAbove(shown, index) ? "open" : "hidden";
}

// Whether any of the file's unchanged lines show.
export function showsAny(shown: ShownRuns): boolean {
  return shown.entire || shown.runs.some((run) => run.open);
}

// The read of the entire file to show, if any, while some of its unchanged lines are asked for: one
// of the version of the diff shown, or once one shows, the one read last, so that a read again
// after the file changes doesn't hide them until it's done. A read kept from before the file
// changed while none were asked for doesn't show, nor do its hunks, which the diff may no longer
// have.
export function entireShown<Read extends { version: string }>(
  read: Read | undefined,
  version: string,
  showing: boolean,
): Read | undefined {
  return showing || read?.version === version ? read : undefined;
}

// The unchanged lines before a run's hunk, or after the last, while they show, the same each time,
// so the hunk's lines rendered again with them aren't rendered again for them.
const noLines: NumberedLine[] = [];

// The run's lines, if they show.
function runIfShown(lines: NumberedLine[], shown: boolean): NumberedLine[] {
  return shown ? lines : noLines;
}

// The first of the unchanged lines that show above the hunk at the index, if any do.
export function firstShownAbove(unchanged: Unchanged, index: number): NumberedLine | undefined {
  return (index === 0 ? unchanged.before : unchanged.after[index - 1])?.[0];
}

// Those of the unchanged lines around the hunks that show: the run above each hunk while it's open,
// and those after the last only while the entire file shows, or else those of them commented on, by
// index, the run before the first hunk at 0, and the one after the hunk at an index at the next.
export function shownLines(
  unchanged: Unchanged,
  shown: ShownRuns,
  commented: ReadonlySet<number> = noRuns,
): Unchanged {
  return {
    before: runIfShown(unchanged.before, showsAbove(shown, 0, commented)),
    after: unchanged.after.map((lines, index) =>
      runIfShown(lines, showsAbove(shown, index + 1, commented)),
    ),
  };
}

// The runs of unchanged lines with a line commented on, by index: the run before the first hunk at
// 0, and the one after the hunk at an index at the next.
export function commentedRuns(
  unchanged: Unchanged,
  commented: (line: NumberedLine) => boolean,
): ReadonlySet<number> {
  return new Set(
    [unchanged.before, ...unchanged.after].flatMap((lines, index) =>
      lines.some(commented) ? [index] : [],
    ),
  );
}

// Where a run of unchanged lines just shown above a hunk is in the view, from the view's top: the
// top of its first line, unless that isn't rendered, and of the hunk's bar, under its last line,
// where the bar is while it isn't stuck at the top. `ceiling` is how far down the bars stuck at the
// view's top reach, and `middle` the view's middle.
export interface RunInView {
  first: number | undefined;
  bar: number;
  ceiling: number;
  middle: number;
}

// How far up to scroll the view to show a run of unchanged lines just shown above a hunk, which the
// hunk stayed in place for: none while any of its lines are in sight, and else as far as shows
// them all, or as keeps the hunk's bar no lower than the view's middle.
export function upToShow({ first, bar, ceiling, middle }: RunInView): number {
  if (bar > ceiling) {
    return 0;
  }

  return Math.max(0, Math.min(ceiling - (first ?? Number.NEGATIVE_INFINITY), middle - bar));
}
