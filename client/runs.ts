import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";
import type { NumberedLine, Unchanged } from "./lines";

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

// Shows the run above the hunk at the index, too.
export function openedAbove(shown: ShownRuns, index: number): ShownRuns {
  return {
    entire: shown.entire,
    runs: shown.runs.map((run, at) => (at === index ? { ...run, open: true } : run)),
  };
}

// Shows the entire file, or while it shows, none of the unchanged lines.
export function toggledEntire(shown: ShownRuns): ShownRuns {
  return {
    entire: !shown.entire,
    runs: shown.entire ? shown.runs.map((run) => ({ ...run, open: false })) : shown.runs,
  };
}

// Whether the run of unchanged lines above the hunk at the index shows.
export function showsAbove(shown: ShownRuns, index: number): boolean {
  return shown.entire || shown.runs[index]?.open === true;
}

// Whether any of the file's unchanged lines show.
export function showsAny(shown: ShownRuns): boolean {
  return shown.entire || shown.runs.some((run) => run.open);
}

// The unchanged lines before a run's hunk, or after the last, while they show, the same each time,
// so the hunk's lines rendered again with them aren't rendered again for them.
const noLines: NumberedLine[] = [];

// The run's lines, if they show.
function runIfShown(lines: NumberedLine[], shown: boolean): NumberedLine[] {
  return shown ? lines : noLines;
}

// Those of the unchanged lines around the hunks that show: the run above each hunk while it's open,
// and those after the last only while the entire file shows.
export function shownLines(unchanged: Unchanged, shown: ShownRuns): Unchanged {
  return {
    before: runIfShown(unchanged.before, showsAbove(shown, 0)),
    after: unchanged.after.map((lines, index) => runIfShown(lines, showsAbove(shown, index + 1))),
  };
}
