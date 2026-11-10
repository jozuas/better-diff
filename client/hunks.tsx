import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { ReactElement } from "react";
import {
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { StyleSheet, View } from "react-native";

import type { diffRpc } from "../shared/diff";
import type { Controls } from "./actions";
import type { NumberedFile } from "./comments";
import { UnchangedLines } from "./diff-lines";
import { beforeSection } from "./find";
import { useFindableLines } from "./find-page";
import { groups } from "./groups";
import type { OpenFile } from "./groups";
import { HunkArea } from "./hunk-area";
import { HunkBar } from "./hunk-bar";
import { unchangedLines } from "./lines";
import type { NumberedLine, Unchanged } from "./lines";
import { LinesArea } from "./lines-menu";
import { shownFileOf } from "./place";
import { pointedHunk } from "./pointed";
import { covers, widened, windowAround } from "./rendering";
import type { LineWindow } from "./rendering";
import { ReviewContext } from "./review-context";
import { fileId, hunkId, onSide, rangeInHunk } from "./selection";
import type { LineRange } from "./selection";
import { useFocus } from "./text-selection";
import {
  KeptPlaceContext,
  rectOf,
  scrollToOffset,
  scrollToShow,
  stopScrollAnchoring,
  useLatest,
} from "./web";

type Diff = RpcOutput<typeof diffRpc>;

function useStyles() {
  return useMemo(
    () =>
      StyleSheet.create({
        // Under each hunk, and the unchanged lines before the first.
        spaced: { marginBottom: 8 },
      }),
    [],
  );
}

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
  // The query of its diff with every line of the file, which showing the entire file reads.
  entireQuery: UseQueryOptions<Diff, Error, Diff, (string | boolean)[]>;
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
  onHeight: (height: number) => void;
  onRun: (hunk: number) => void;
  onShow: (hunk: number) => void;
  onReveal: (line: string) => void;
  barHeight: () => number;
}

// What the bars act with, as the latest render gives it.
interface BarState {
  entire: boolean;
  onHunkRun: HunksProps["onHunkRun"];
  view: string;
  barsBelow: number | undefined;
  // Shows the entire file, from around the hunk at the index, or only the hunks again.
  toggle: (hunk: number) => void;
}

// The bars' actions, the same each render, with what the latest render gives them, so that a change
// that reaches only some hunks, as the selection's does, renders only their bars again. Toggling the
// entire file keeps the hunk in place, and so does an action on a hunk while the entire file shows,
// where the next hunk takes its place. Showing a hunk scrolls the view to its lines' start, under
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
      onHeight: (height) => {
        barHeight.current = height;
      },
      onRun: (hunk) => {
        const { entire, onHunkRun } = latest.current;

        onHunkRun(hunkId(container, hunk), barHeight.current);

        if (entire) {
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

// The diff to show: read again with every line of the file while the entire file is asked for, once
// that's read, and else as it is.
function useEntireDiff(diff: Diff, query: HunksProps["entireQuery"], entire: boolean): Diff {
  const whole = useQuery({ ...query, enabled: entire });

  return entire ? (whole.data ?? diff) : diff;
}

// The lines outside a hunk while only the hunks show, the same each time, so the hunk's lines
// rendered again with them aren't rendered again for them.
const noLines: NumberedLine[] = [];

// Each hunk's bar is followed by its lines. The pointer over either reveals the hunk's actions, and
// the toggle that shows the entire file, with the unchanged lines around the hunks, once the diff is
// read again with them, or only the hunks again, which keeps the hunk in place. Each bar stays at
// the top while its lines scroll under it, or under the file's bar while the hunks scroll with the
// view's other diffs, until the next hunk's bar covers it or the file's diff ends. While the entire
// file shows, the next hunk takes the place of one an action is run on. Side by side, the selection
// is in the side with focus. The pointer moving from one hunk to another renders only their bars
// again, and the selection changing only the hunks it leaves or reaches. Right-clicking its lines
// opens their menu, and letting go of a selection of them shows a bar, which start a comment and
// copy what was selected then.
export function Hunks({
  diff,
  file,
  view,
  fileIndex,
  selection,
  scrolls,
  barsBelow,
  entireQuery,
  sideBySide,
  onHunkRun,
  onFileRun,
  controls,
  theme,
}: HunksProps): ReactElement {
  const styles = useStyles();
  const pointed = useMemo(() => pointedHunk(), []);
  const [entire, setEntire] = useState(false);
  const shownDiff = useEntireDiff(diff, entireQuery, entire);
  const showsEntire = shownDiff !== diff;
  const container = fileId(view, fileIndex);
  const [window, showAround] = useLineWindow(showsEntire ? shownDiff.contents.length : undefined);

  const bars = useBarActions(container, {
    entire,
    onHunkRun,
    view,
    barsBelow,
    toggle: (hunk) => {
      setEntire((shown) => !shown);
      showAround(shownDiff.hunks[hunk]?.newStart ?? 1);
    },
  });

  const unchanged = useMemo(
    () => (showsEntire ? unchangedLines(shownDiff) : { before: noLines, after: [] }),
    [shownDiff, showsEntire],
  );

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

  const hunks = shownDiff.hunks.flatMap((hunk, index) => {
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
        controls={controls}
        entire={entire}
        onToggleEntire={bars.onToggleEntire}
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
        file={commented}
        path={file.path}
        view={view}
        fileIndex={fileIndex}
        selection={selected}
        pointed={pointed}
        focus={focus}
        after={unchanged.after[index] ?? noLines}
        window={window}
        ceiling={ceiling}
        theme={theme}
      />,
    ];
  });

  const shown = [
    <LinesArea key="before" path={file.path} ceiling={ceiling} theme={theme}>
      <UnchangedLines
        lines={unchanged.before}
        container={container}
        section={beforeSection}
        focus={focus}
        window={window}
        style={styles.spaced}
        theme={theme}
      />
    </LinesArea>,
    ...hunks,
  ];

  return scrolls ? (
    <ScrollView
      nativeID={view}
      stickyHeaderIndices={shownDiff.hunks.map((_, index) => 2 * index + 1)}
    >
      {shown}
    </ScrollView>
  ) : (
    <View>{shown}</View>
  );
}
