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
import { firstShownAbove, showsAny, upToShow } from "./runs";
import { fileId, hunkId, onSide, rangeInHunk, unchangedLineId } from "./selection";
import type { LineRange } from "./selection";
import { SelectionBarLayer } from "./selection-bar";
import { useFocus } from "./text-selection";
import { UnchangedLinesShown } from "./unchanged-shown";
import type { EntireQuery, UnchangedShown } from "./unchanged-shown";
import {
  KeptPlaceContext,
  offsetIn,
  rectOf,
  scrollBy,
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
  onUnchanged: (hunk: number, action: "open" | "close" | undefined) => void;
  onHeight: (height: number) => void;
  onRun: (hunk: number) => void;
  onShow: (hunk: number) => void;
  onReveal: (line: string) => void;
  barHeight: () => number;
}

// What the bars act with, as the latest render gives it: what the diff shows of its unchanged lines,
// and what shows or hides them.
interface BarState {
  around: UnchangedShown;
  onHunkRun: HunksProps["onHunkRun"];
  view: string;
  barsBelow: number | undefined;
}

// The bars' actions, the same each render, with what the latest render gives them, so that a change
// that reaches only some hunks, as the selection's does, renders only their bars again. Toggling the
// entire file keeps the hunk in place, as showing or hiding the run of unchanged lines above it
// does, but for showing it where none of it would then be in sight, as with the hunk's bar at the
// top, where the view scrolls up to show it. An action on a hunk while any unchanged lines show
// keeps the hunk's place too, where the next hunk takes its place. Showing a hunk scrolls the view
// to its lines' start, under its bar, and under the file's bar where that stays at the top too, and
// so does revealing a line, if it has to.
function useBarActions(container: string, state: BarState): BarActions {
  const latest = useLatest(state);
  const barHeight = useRef(0);
  const kept = useContext(KeptPlaceContext);

  return useMemo(() => {
    // Scrolls the view up, if it has to, to show the run of unchanged lines above the hunk at the
    // index, whose first line has the id.
    function scrollToRun(hunk: number, first: string): void {
      const { view, barsBelow } = latest.current;
      const lines = offsetIn(view, hunkId(container, hunk)) ?? Number.POSITIVE_INFINITY;

      const up = upToShow({
        first: offsetIn(view, first),
        bar: lines - barHeight.current,
        ceiling: (barsBelow ?? 0) + barHeight.current,
        middle: rectOf(view).height / 2,
      });

      scrollBy(view, -up);
    }

    // Once the hunk at the index is back in its place, shows the run of unchanged lines above it,
    // if it shows.
    function showRun(hunk: number): void {
      const first = firstShownAbove(latest.current.around.unchanged, hunk);

      if (first !== undefined) {
        scrollToRun(hunk, unchangedLineId(container, first));
      }
    }

    return {
      onToggleEntire: (hunk) => {
        kept.hold(container, hunkId(container, hunk));
        latest.current.around.toggle(hunk);
      },
      onUnchanged: (hunk, action) => {
        if (action !== undefined) {
          kept.hold(container, hunkId(container, hunk), () => {
            showRun(hunk);
          });
          latest.current.around[action](hunk);
        }
      },
      onHeight: (height) => {
        barHeight.current = height;
      },
      onRun: (hunk) => {
        const { around, onHunkRun } = latest.current;

        onHunkRun(hunkId(container, hunk), barHeight.current);

        if (showsAny(around.shown)) {
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
    };
  }, [container, latest, kept]);
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
// count of the unchanged lines above the hunk does, which shows those, and what hides them again.
// Each bar stays at the top while its lines scroll under it, or under the file's bar while the
// hunks scroll with the view's other diffs, until the next hunk's bar covers it or the file's diff
// ends. While any unchanged
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
  shown: around,
}: HunksProps & { shown: UnchangedShown }): ReactElement {
  const { shownDiff, shown: runs, window, showAround, unchanged, above } = around;
  const pointed = useMemo(() => pointedHunk(), []);
  const requests = useMemo(() => barRequests(), []);

  const container = fileId(view, fileIndex);
  const bars = useBarActions(container, { around, onHunkRun, view, barsBelow });

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

  const hunks = above.flatMap((each, index) => {
    const { hunk } = each;
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
        unchanged={each.unchanged}
        unchangedShown={each.shown}
        separates={each.separates}
        onToggleEntire={bars.onToggleEntire}
        onUnchanged={bars.onUnchanged}
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

// The diff's hunks, with those of the unchanged lines around them that show, and those with a line
// commented on, whether or not they're asked to show.
export function Hunks(props: HunksProps): ReactElement {
  return (
    <UnchangedLinesShown diff={props.diff} query={props.entireQuery} file={useNumbered(props.file)}>
      {(shown) => <HunksShown {...props} shown={shown} />}
    </UnchangedLinesShown>
  );
}
