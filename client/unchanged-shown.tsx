import type { RpcOutput } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { startTransition, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { diffRpc } from "../shared/diff";
import { commentedOn, commentedOutside } from "./commenting";
import type { NumberedFile } from "./comments";
import { aboveHunks, unchangedLines } from "./lines";
import type { Above, NumberedLine, Unchanged } from "./lines";
import { covers, widened, windowAround } from "./rendering";
import type { LineWindow } from "./rendering";
import { ReviewContext } from "./review-context";
import {
  carriedTo,
  closedAbove,
  commentedRuns,
  entireShown,
  openedAbove,
  runShown,
  showsAny,
  shownLines,
  toggledEntire,
} from "./runs";
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

// The diff read with every line of the file, while it's wanted, once it's read.
function useEntireRead(query: EntireQuery, wanted: boolean): Diff | undefined {
  const whole = useQuery({ ...query, enabled: wanted });

  return wanted ? whole.data : undefined;
}

// The diff to show: read again with every line of the file while any of its unchanged lines are
// asked for, once that's read, as entireShown has it, and else as it is.
function useEntireDiff(diff: Diff, query: EntireQuery, wanted: boolean): Diff {
  const [showing, setShowing] = useState(false);
  const shown = entireShown(useEntireRead(query, wanted), diff.version, showing);

  if ((shown !== undefined) !== showing) {
    setShowing(!showing);
  }

  return shown ?? diff;
}

// What's shown of the runs of unchanged lines around the hunks, carried over to them each time they
// change, and what shows the entire file, or none of them, and shows or hides the run above the
// hunk at an index.
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
    close: (index: number) => {
      setState((now) => ({ hunks: now.hunks, shown: closedAbove(now.shown, index) }));
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
  // around it, and hides that run.
  toggle: (hunk: number) => void;
  open: (hunk: number) => void;
  close: (hunk: number) => void;
}

// What's commented on among a diff's lines: what says whether a line has comments under it, or
// one being written, and whether any of them is on a line outside the hunks, until it's known how
// the review numbers the lines, or without a review, nothing.
interface CommentedLines {
  commented: ((line: NumberedLine) => boolean) | undefined;
  outside: boolean;
}

// No runs of unchanged lines, the same each time.
const noRuns: ReadonlySet<number> = new Set();

// The runs of unchanged lines around the diff's hunks that show, which the diff with every line of
// the file is read for: none until asked for, then the run above a hunk once its bar asks, until it
// asks to hide it, or the entire file once the toggle does, and whatever's asked, those with a line
// commented on, which the diff's read for while a comment's on a line outside the hunks.
function useUnchangedShown(
  diff: Diff,
  query: EntireQuery,
  { commented, outside }: CommentedLines,
): UnchangedShown {
  const runs = useShownRuns(diff.hunks);
  const shownDiff = useEntireDiff(diff, query, showsAny(runs.shown) || outside);
  const whole = shownDiff !== diff;
  const [window, showAround] = useLineWindow(whole ? shownDiff.contents.length : undefined);
  const all = useMemo(() => (whole ? unchangedLines(shownDiff) : none), [shownDiff, whole]);

  const kept = useMemo(
    () => (commented === undefined ? noRuns : commentedRuns(all, commented)),
    [all, commented],
  );

  const shownAround = useMemo(
    () => (whole ? shownLines(all, runs.shown, kept) : none),
    [whole, all, runs.shown, kept],
  );

  const above = useMemo(
    () =>
      aboveHunks(shownDiff.hunks, (index) =>
        whole ? runShown(runs.shown, index, kept) : "hidden",
      ),
    [shownDiff.hunks, whole, runs.shown, kept],
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
    close: runs.close,
  };
}

// Nothing commented on, as while lines can't be.
const uncommented: CommentedLines = { commented: undefined, outside: false };

// What's commented on among the diff's lines, while they can be commented on.
function useCommentedLines(diff: Diff, file: NumberedFile | undefined): CommentedLines {
  const review = useContext(ReviewContext);
  const threads = review?.threads;
  const editing = review?.editing;

  return useMemo(
    () =>
      file === undefined || threads === undefined
        ? uncommented
        : {
            commented: commentedOn(file, threads, editing),
            outside: commentedOutside(file, diff.hunks, threads, editing),
          },
    [diff.hunks, file, threads, editing],
  );
}

interface UnchangedLinesShownProps {
  diff: Diff;
  query: EntireQuery;
  // The file, with how the review numbers its lines, while they can be commented on.
  file: NumberedFile | undefined;
  children: (shown: UnchangedShown) => ReactElement;
}

// Renders what it's given with what the diff shows of its unchanged lines, those with a line
// commented on among them.
export function UnchangedLinesShown({
  diff,
  query,
  file,
  children,
}: UnchangedLinesShownProps): ReactElement {
  return <>{children(useUnchangedShown(diff, query, useCommentedLines(diff, file)))}</>;
}
