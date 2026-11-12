import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { View } from "react-native";

import type { diffRpc } from "../shared/diff";
import type { Controls } from "./actions";
import { barRequests } from "./bar-requests";
import { commentedOn, commentedOutside } from "./commenting";
import type { NumberedFile } from "./comments";
import { useFindableLines } from "./find-page";
import { groups } from "./groups";
import type { OpenFile } from "./groups";
import { HunkArea, LinesBefore } from "./hunk-area";
import { HunkBar } from "./hunk-bar";
import type { NumberedLine, Unchanged } from "./lines";
import { shownFileOf } from "./place";
import { pointedHunk } from "./pointed";
import { ReviewContext } from "./review-context";
import { showsAny } from "./runs";
import { fileId, hunkId, onSide, rangeInHunk } from "./selection";
import type { LineRange } from "./selection";
import { SelectionBarLayer } from "./selection-bar";
import { useFocus } from "./text-selection";
import { UnchangedLinesShown } from "./unchanged-shown";
import type { CommentedLines, EntireQuery, UnchangedShown } from "./unchanged-shown";
import {
  KeptPlaceContext,
  rectOf,
  scrollToOffset,
  scrollToShow,
  stopScrollAnchoring,
  useLatest,
} from "./web";

type Diff = RpcOutput<typeof diffRpc>;

export interface HunksProps {
  diff: Diff;
  file: OpenFile;
  // The id of the view it's shown in, and its index among the view's files.
  view: string;
  fileIndex: number;
  // Its lines the page's text selection touches, if any.
  selection: LineRange | undefined;
  // Whether its hunks scroll in the view on their own, under bars that stay at the top, as when
  // it's the view's only diff, rather than with the view's other diffs.
  scrolls: boolean;
  // While they scroll with the view's other diffs, how far below the view's top their bars stay as
  // their lines scroll under them: under the file's bar, which stays at the top.
  barsBelow?: number;
  // The query of its diff with every line of the file, which showing its unchanged lines reads.
  entireQuery: EntireQuery;
  // Whether it shows the old version's lines beside the new one's, rather than inline.
  sideBySide: boolean;
  // Called just before an action on one of its hunks runs, with the id of the top of the hunk's
  // lines and the height of its bar.
  onHunkRun: (top: string, barHeight: number) => void;
  // Called with its index just before a shortcut in one of its hunks' bars runs an action on it.
  onFileRun?: (fileIndex: number) => void;
  controls: Controls;
  theme: PluginTheme;
}

// What a diff's hunks' bars do, with their hunk's index, and how tall they are.
interface BarActions {
  onToggleEntire: (hunk: number) => void;
  onOpen: (hunk: number) => void;
  onHeight: (height: number) => void;
  onRun: (hunk: number) => void;
  onShow: (hunk: number) => void;
  onReveal: (line: string) => void;
  barHeight: () => number;
}

// What the bars act with, as the latest render gives it.
interface BarState {
  // Whether any of the unchanged lines around the hunks show.
  unchangedShown: boolean;
  onHunkRun: HunksProps["onHunkRun"];
  view: string;
  barsBelow: number | undefined;
  // Shows the entire file, from around the hunk at the index, or only the hunks again.
  toggle: (hunk: number) => void;
  // Shows the run of unchanged lines above the hunk at the index.
  open: (hunk: number) => void;
}

// The bars' actions, the same each render, with what the latest render gives them, so that a change
// that reaches only some hunks, as the selection's does, renders only their bars again. Toggling the
// entire file keeps the hunk in place, as showing the run of unchanged lines above it does, and so
// does an action on a hunk while any unchanged lines show, where the next hunk takes its place. Showing a hunk scrolls the view to its lines' start, under
// its bar, and under the file's bar where that stays at the top too, and so does revealing a line,
// if it has to.
function useBarActions(container: string, state: BarState): BarActions {
  const latest = useLatest(state);
  const barHeight = useRef(0);
  const kept = useContext(KeptPlaceContext);

  return useMemo(
    () => ({
      onToggleEntire: (hunk) => {
        kept.hold(container, hunkId(container, hunk));
        latest.current.toggle(hunk);
      },
      onOpen: (hunk) => {
        kept.hold(container, hunkId(container, hunk));
        latest.current.open(hunk);
      },
      onHeight: (height) => {
        barHeight.current = height;
      },
      onRun: (hunk) => {
        const { unchangedShown, onHunkRun } = latest.current;

        onHunkRun(hunkId(container, hunk), barHeight.current);

        if (unchangedShown) {
          kept.hold(container, hunkId(container, hunk));
        }
      },
      onShow: (hunk) => {
        const { view, barsBelow = 0 } = latest.current;

        scrollToOffset(view, hunkId(container, hunk), barsBelow + barHeight.current);
      },
      onReveal: (line) => {
        const { view, barsBelow = 0 } = latest.current;

        scrollToShow(view, line, barsBelow + barHeight.current);
      },
      barHeight: () => barHeight.current,
    }),
    [container, latest, kept],
  );
}

// Has the view keep the places of the lines it shows of the file at the path, at the container, and
// settle, keeping its place, each time it renders, with whether an action is running.
function useKeptLines(
  path: string,
  hunks: Diff["hunks"],
  unchanged: Unchanged,
  container: string,
  controls: Controls,
): void {
  const kept = useContext(KeptPlaceContext);
  const busy = useSyncExternalStore(controls.subscribe, () => controls.state().busy);

  const lines = useMemo(
    () => shownFileOf(path, hunks, unchanged, container),
    [path, hunks, unchanged, container],
  );

  useLayoutEffect(() => kept.show(container, lines), [kept, container, lines]);

  useLayoutEffect(() => {
    kept.settle(busy);
  });
}

// The file a group lists, with how the review numbers the lines of its diff, once that's known, while
// they can be commented on.
function useNumbered({ group, path }: OpenFile): NumberedFile | undefined {
  const review = useContext(ReviewContext);
  const numbering = review?.numbering({ diff: groups[group].side, path });

  return useMemo(
    () => (numbering === undefined ? undefined : { path, numbering }),
    [path, numbering],
  );
}

// The lines outside a hunk while none show, the same each time, so the hunk's lines rendered again
// with them aren't rendered again for them.
const noLines: NumberedLine[] = [];

// Each hunk's bar is followed by its lines. The pointer over either reveals the hunk's actions, and
// the toggle that shows the entire file, with the unchanged lines around the hunks, once the diff
// is read again with them, or only the hunks again, which keeps the hunk in place, as the bar's
// count of the unchanged lines above the hunk does, which shows those. Each bar stays at the top
// while its lines scroll under it, or under the file's bar while the hunks scroll with the view's
// other diffs, until the next hunk's bar covers it or the file's diff ends. While any unchanged
// lines show, the next hunk takes the place of one an action is run on. Side by side, the selection
// is in the side with focus. The pointer moving from one hunk to another renders only their bars
// again, and the selection changing only the hunks it leaves or reaches. Right-clicking its lines
// opens their menu, and letting go of a selection of them shows a bar, which start a comment and
// copy what was selected then.
function HunksShown({
  diff,
  file,
  view,
  fileIndex,
  selection,
  scrolls,
  barsBelow,
  sideBySide,
  onHunkRun,
  onFileRun,
  controls,
  theme,
  shown: { shownDiff, shown: runs, window, showAround, unchanged, above, toggle, open },
}: HunksProps & { shown: UnchangedShown }): ReactElement {
  const pointed = useMemo(() => pointedHunk(), []);
  const requests = useMemo(() => barRequests(), []);

  const container = fileId(view, fileIndex);

  const bars = useBarActions(container, {
    unchangedShown: showsAny(runs),
    onHunkRun,
    view,
    barsBelow,
    toggle,
    open,
  });

  useKeptLines(file.path, shownDiff.hunks, unchanged, container, controls);

  useFindableLines(container, {
    view,
    fileIndex,
    hunks: shownDiff.hunks,
    unchanged,
    showAround,
    margin: () => (barsBelow ?? 0) + bars.barHeight(),
  });

  useEffect(() => {
    if (scrolls) {
      stopScrollAnchoring(view);
    }
  }, [scrolls, view]);

  const focus = useFocus(sideBySide);
  const range = useMemo(() => onSide(selection, focus), [selection, focus]);

  const commented = useNumbered(file);

  // The highest the view shows lines from: under its file's bar, while that stays at its top, and
  // a hunk's bar.
  function ceiling(): number {
    return rectOf(view).y + (barsBelow ?? 0) + bars.barHeight();
  }

  const hunks = above.flatMap(({ hunk, leftOut, separates }, index) => {
    const selected = rangeInHunk(range, index);

    return [
      <HunkBar
        key={`bar ${hunk.oldStart},${hunk.newStart}`}
        hunk={hunk}
        index={index}
        version={shownDiff.version}
        fileVersion={diff.version}
        file={file}
        fileIndex={fileIndex}
        view={view}
        selection={selected}
        sides={focus}
        pointed={pointed}
        requests={requests}
        controls={controls}
        entire={runs.entire}
        leftOut={leftOut}
        separates={separates}
        onToggleEntire={bars.onToggleEntire}
        onOpen={bars.onOpen}
        onHeight={bars.onHeight}
        onRun={bars.onRun}
        onFileRun={onFileRun}
        onShow={bars.onShow}
        onReveal={bars.onReveal}
        stuckBelow={barsBelow}
        theme={theme}
      />,
      <HunkArea
        key={`lines ${hunk.oldStart},${hunk.newStart}`}
        hunk={hunk}
        index={index}
        version={shownDiff.version}
        open={file}
        file={commented}
        view={view}
        fileIndex={fileIndex}
        selection={selected}
        pointed={pointed}
        requests={requests}
        focus={focus}
        after={unchanged.after[index] ?? noLines}
        window={window}
        ceiling={ceiling}
        controls={controls}
        theme={theme}
      />,
    ];
  });

  const shown = [
    <LinesBefore
      key="before"
      lines={unchanged.before}
      path={file.path}
      file={commented}
      view={view}
      fileIndex={fileIndex}
      requests={requests}
      focus={focus}
      window={window}
      ceiling={ceiling}
      controls={controls}
      theme={theme}
    />,
    ...hunks,
  ];

  return scrolls ? (
    <SelectionBarLayer theme={theme}>
      {(layer) => (
        <ScrollView
          nativeID={view}
          stickyHeaderIndices={shownDiff.hunks.map((_, index) => 2 * index + 1)}
        >
          {[...shown, layer]}
        </ScrollView>
      )}
    </SelectionBarLayer>
  ) : (
    <View>{shown}</View>
  );
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

// The diff's hunks, with those of the unchanged lines around them that show, and those with a line
// commented on, whether or not they're asked to show.
export function Hunks(props: HunksProps): ReactElement {
  const commented = useCommentedLines(props.diff, useNumbered(props.file));

  return (
    <UnchangedLinesShown diff={props.diff} query={props.entireQuery} commented={commented}>
      {(shown) => <HunksShown {...props} shown={shown} />}
    </UnchangedLinesShown>
  );
}
