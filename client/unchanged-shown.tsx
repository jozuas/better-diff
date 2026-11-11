import type { RpcOutput } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";

import type { diffRpc } from "../shared/diff";
import { aboveHunks, unchangedLines } from "./lines";
import type { Above, Unchanged } from "./lines";
import { covers, widened, windowAround } from "./rendering";
import type { LineWindow } from "./rendering";
import { carriedTo, openedAbove, showsAbove, showsAny, shownLines, toggledEntire } from "./runs";
import type { ShownRuns } from "./runs";

type Diff = RpcOutput<typeof diffRpc>;

// The query of a file's diff with every line of the file.
export type EntireQuery = UseQueryOptions<Diff, Error, Diff, (string | boolean)[]>;

// How many of the new version's lines the entire file renders at first, around the line it's shown
// from, as many as a tall view shows, and how many more each time after that.
const firstLines = 200;
const moreLines = 1000;

// The lines of the file's new version, `total` of them, that the entire file renders: at first those
// around the line the returned function is given, and then more each time, in a transition that
// what the page hears comes before, so that the view shows the lines around the hunk the entire
// file is shown from at once, and scrolls and hears the pointer while it renders the others. No
// `total` while the entire file doesn't show.
function useLineWindow(total: number | undefined): [LineWindow, (line: number) => void] {
  const [window, setWindow] = useState(() => windowAround(1, firstLines));

  useEffect(() => {
    if (total !== undefined && !covers(window, total)) {
      startTransition(() => {
        setWindow(widened(window, total, moreLines));
      });
    }
  }, [window, total]);

  const around = useCallback((line: number) => {
    setWindow(windowAround(line, firstLines));
  }, []);

  return [window, around];
}

// The diff to show: read again with every line of the file while any of its unchanged lines are
// asked for, once that's read, and else as it is.
function useEntireDiff(diff: Diff, query: EntireQuery, wanted: boolean): Diff {
  const whole = useQuery({ ...query, enabled: wanted });

  return wanted ? (whole.data ?? diff) : diff;
}

// What's shown of the runs of unchanged lines around the hunks, carried over to them each time they
// change, and what shows the entire file, or none of them, and the run above the hunk at an index.
function useShownRuns(hunks: Diff["hunks"]) {
  const [state, setState] = useState(() => ({
    hunks,
    shown: carriedTo({ entire: false, runs: [] }, hunks),
  }));

  const current = state.hunks === hunks ? state : { hunks, shown: carriedTo(state.shown, hunks) };

  if (current !== state) {
    setState(current);
  }

  return {
    shown: current.shown,
    toggle: () => {
      setState((now) => ({ hunks: now.hunks, shown: toggledEntire(now.shown) }));
    },
    open: (index: number) => {
      setState((now) => ({ hunks: now.hunks, shown: openedAbove(now.shown, index) }));
    },
  };
}

// The unchanged lines around the hunks until the diff with every line of the file is read, the same
// each time, so the view holds a hunk's place until they show.
const none: Unchanged = { before: [], after: [] };

// What a file's diff shows of its unchanged lines, and what shows them.
export interface UnchangedShown {
  // The diff to show, with every line of the file once that's read while any are asked for.
  shownDiff: Diff;
  shown: ShownRuns;
  // The lines it renders of the file's new version, and what renders them around a line first.
  window: LineWindow;
  showAround: (line: number) => void;
  // The unchanged lines that show around the hunks, and each hunk with what's above it.
  unchanged: Unchanged;
  above: Above[];
  // Shows the entire file, or only the hunks again, and the run above the hunk at the index, from
  // around it.
  toggle: (hunk: number) => void;
  open: (hunk: number) => void;
}

// The runs of unchanged lines around the diff's hunks that show, which the diff with every line of
// the file is read for: none until asked for, then the run above a hunk once its bar asks, or the
// entire file once the toggle does.
function useUnchangedShown(diff: Diff, query: EntireQuery): UnchangedShown {
  const runs = useShownRuns(diff.hunks);
  const shownDiff = useEntireDiff(diff, query, showsAny(runs.shown));
  const whole = shownDiff !== diff;
  const [window, showAround] = useLineWindow(whole ? shownDiff.contents.length : undefined);

  const shownAround = useMemo(
    () => (whole ? shownLines(unchangedLines(shownDiff), runs.shown) : none),
    [shownDiff, whole, runs.shown],
  );

  const above = useMemo(
    () => aboveHunks(shownDiff.hunks, (index) => whole && showsAbove(runs.shown, index)),
    [shownDiff.hunks, whole, runs.shown],
  );

  function showAroundHunk(hunk: number): void {
    showAround(shownDiff.hunks[hunk]?.newStart ?? 1);
  }

  return {
    shownDiff,
    shown: runs.shown,
    window,
    showAround,
    unchanged: shownAround,
    above,
    toggle: (hunk) => {
      runs.toggle();
      showAroundHunk(hunk);
    },
    open: (hunk) => {
      runs.open(hunk);
      showAroundHunk(hunk);
    },
  };
}

interface UnchangedLinesShownProps {
  diff: Diff;
  query: EntireQuery;
  children: (shown: UnchangedShown) => ReactElement;
}

// Renders what it's given with what the diff shows of its unchanged lines.
export function UnchangedLinesShown({
  diff,
  query,
  children,
}: UnchangedLinesShownProps): ReactElement {
  return <>{children(useUnchangedShown(diff, query))}</>;
}
