import type { RpcOutput } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { startTransition, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { diffRpc } from "../shared/diff";
import { hasComments, linesCommented } from "./commenting";
import type { NumberedFile } from "./comments";
import { groups } from "./groups";
import type { OpenFile } from "./groups";
import { aboveHunks, belowHunks, unchangedLines } from "./lines";
import type { Above, Below, Unchanged } from "./lines";
import { reviewedFile } from "./numbering";
import type { CommentedFile } from "./numbering";
import { covers, widened, windowAround } from "./rendering";
import type { LineWindow } from "./rendering";
import { ReviewContext } from "./review-context";
import {
  carriedOver,
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
import type { CarriedRuns, ShownRuns } from "./runs";

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

// The diff to show, as useEntireDiff has it, with every line of the file while any of its runs of
// unchanged lines show, or `commented` asks for them, and what's shown of those runs, carried over to
// its hunks each time they change, so that a run stays open above the hunk it was open above,
// whichever of the diff and the entire file is read first after a change. And what shows the
// entire file, or none of them, and shows or hides the run above the hunk at an index, or the one
// after the last hunk, at the index after the hunks'.
function useShownRuns(diff: Diff, query: EntireQuery, commented: boolean) {
  const [state, setState] = useState<CarriedRuns<Diff["hunks"]>>(() => ({
    hunks: diff.hunks,
    shown: carriedTo({ entire: false, runs: [], after: false }, diff.hunks),
  }));

  const shownDiff = useEntireDiff(diff, query, showsAny(state.shown) || commented);
  const current = carriedOver(state, shownDiff.hunks);

  if (current !== state) {
    setState(current);
  }

  return {
    shownDiff,
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
  // The diff to show, with every line of the file once that's read while any are asked for, and its
  // file, with how the review numbers its lines, as that read numbers them, while they can be
  // commented on.
  shownDiff: Diff;
  file: NumberedFile | undefined;
  shown: ShownRuns;
  // The lines it renders of the file's new version, and what renders them around a line first.
  window: LineWindow;
  showAround: (line: number) => void;
  // The unchanged lines that show around the hunks, each hunk with what's above it, and what's
  // below the last.
  unchanged: Unchanged;
  above: Above[];
  below: Below;
  // Shows the entire file, or only the hunks again, and the run above the hunk at the index, from
  // around it, or the one after the last hunk, at the index after the hunks', from its start, and
  // hides that run.
  toggle: (hunk: number) => void;
  open: (hunk: number) => void;
  close: (hunk: number) => void;
}

// No runs of unchanged lines, the same each time.
const noRuns: ReadonlySet<number> = new Set();

// What says whether a line of the file's diff has comments under it, or one being written, while its
// lines can be commented on, and it's known how the review numbers them. The same while what shows
// under the lines is, though the review changes otherwise, as while it shows a comment.
function useCommentedLines(file: NumberedFile | undefined) {
  const commentsIn = useContext(ReviewContext)?.commentsIn;

  return useMemo(() => linesCommented(commentsIn, file), [commentsIn, file]);
}

// The diff's file, with how the review numbers its lines, as the diff was read with it, while they
// can be commented on.
function useNumbered(commented: CommentedFile | undefined, diff: Diff): NumberedFile | undefined {
  return useMemo(
    () => (commented === undefined ? undefined : reviewedFile(commented, diff)),
    [commented, diff],
  );
}

// The runs of unchanged lines around the diff's hunks that show, which the diff with every line of
// the file is read for: none until asked for, then the run above a hunk once its bar asks, or the
// one after the last once the bar at the diff's end does, until it asks to hide it, or the entire
// file once the toggle does, and whatever's asked, those with a line
// commented on. The diff's read for while a comment's on the file, or being written on it, so that
// the hunks show from the read that the comments are placed on the lines of, which the review reads
// too.
function useUnchangedShown(
  diff: Diff,
  query: EntireQuery,
  commented: CommentedFile | undefined,
): UnchangedShown {
  const review = useContext(ReviewContext);
  const runs = useShownRuns(diff, query, hasComments(review, commented));
  const { shownDiff } = runs;
  const file = useNumbered(commented, shownDiff);
  const commentedLine = useCommentedLines(file);
  const whole = shownDiff !== diff;
  const [window, showAround] = useLineWindow(whole ? shownDiff.contents.length : undefined);
  const all = useMemo(() => (whole ? unchangedLines(shownDiff) : none), [shownDiff, whole]);

  const kept = useMemo(
    () => (commentedLine === undefined ? noRuns : commentedRuns(all, commentedLine)),
    [all, commentedLine],
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

  const below = useMemo(
    () =>
      belowHunks(
        shownDiff.hunks,
        shownDiff.newLines,
        whole ? runShown(runs.shown, shownDiff.hunks.length, kept) : "hidden",
      ),
    [shownDiff.hunks, shownDiff.newLines, whole, runs.shown, kept],
  );

  function showAroundHunk(hunk: number): void {
    showAround(shownDiff.hunks[hunk]?.newStart ?? below.first);
  }

  return {
    shownDiff,
    file,
    shown: runs.shown,
    window,
    showAround,
    unchanged: shownAround,
    above,
    below,
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

// The diff of the file a group lists, while its lines can be commented on.
function useCommented({ group, path }: OpenFile): CommentedFile | undefined {
  const commented = useContext(ReviewContext) !== undefined;

  return useMemo(
    () => (commented ? { diff: groups[group].side, path } : undefined),
    [commented, group, path],
  );
}

interface UnchangedLinesShownProps {
  diff: Diff;
  query: EntireQuery;
  // The file whose diff it is, as its group lists it.
  file: OpenFile;
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
  return <>{children(useUnchangedShown(diff, query, useCommented(file)))}</>;
}
