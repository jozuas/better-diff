import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { Dispatch, ReactElement, SetStateAction } from "react";
import { useContext, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { diffRpc } from "../shared/diff";
import type { Controls } from "./actions";
import { HunkLines, UnchangedLines } from "./diff-lines";
import { FontSizesContext } from "./fonts";
import type { OpenFile } from "./groups";
import { Hoverable, TintLayer } from "./hoverable";
import { HunkBar } from "./hunk-bar";
import { labelOf } from "./labels";
import { unchangedLines } from "./lines";
import type { NumberedLine } from "./lines";
import { ModeBar } from "./mode-bar";
import { pointedHunk } from "./pointed";
import { fileId, hunkId, onSide, rangeInHunk } from "./selection";
import type { LineRange } from "./selection";
import type { Focus, Side } from "./side-by-side";
import { clearSelection } from "./text-selection";
import { useHeldPlace, useLatest } from "./web";

type Diff = RpcOutput<typeof diffRpc>;

function useStyles(theme: PluginTheme) {
  const fonts = useContext(FontSizesContext);

  return useMemo(
    () =>
      StyleSheet.create({
        labelRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
        label: { fontSize: fonts.text, color: theme.colors.foregroundMuted },
        expand: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 4, overflow: "hidden" },
        expandText: { fontSize: fonts.small, color: theme.colors.foreground },
        // Under each hunk, and the unchanged lines before the first.
        spaced: { marginBottom: 8 },
      }),
    [theme, fonts],
  );
}

type Styles = ReturnType<typeof useStyles>;

export interface DiffBodyProps {
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
  // The query of its diff with every line of the file, which showing the entire file reads.
  entireQuery: UseQueryOptions<Diff, Error, Diff, (string | boolean)[]>;
  // Whether it shows the old version's lines beside the new one's, rather than inline.
  sideBySide: boolean;
  // Called just before an action on one of its hunks runs, with the id of the top of the hunk's
  // lines and the height of its bar.
  onHunkRun: (top: string, barHeight: number) => void;
  controls: Controls;
  // Asks for a collapsed diff's lines.
  onExpand: () => void;
  theme: PluginTheme;
}

interface LabelRowProps {
  label: string;
  diff: Diff;
  onExpand: () => void;
  styles: Styles;
  theme: PluginTheme;
}

// What's shown instead of a diff without lines, with a button that shows a collapsed one's.
function LabelRow({ label, diff, onExpand, styles, theme }: LabelRowProps): ReactElement {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{label}</Text>
      {diff.collapsed === undefined ? null : (
        <Hoverable
          accessibilityRole="button"
          accessibilityLabel="Show diff"
          style={styles.expand}
          onPress={onExpand}
        >
          {({ hovered, pressed }) => (
            <>
              <TintLayer
                color={theme.colors.foreground}
                hovered={hovered}
                pressed={pressed}
                filled
              />
              <Text selectable={false} style={styles.expandText}>
                Show diff
              </Text>
            </>
          )}
        </Hoverable>
      )}
    </View>
  );
}

// Side by side, which side has focus: the one the pointer was last pressed on, the new version's
// until it is. Undefined inline. Pressing the pointer on the other side clears the selection, which
// the page's order of the sides' lines has that side's lines in, so the press starts a selection
// rather than dragging the one there was.
function useFocus(sideBySide: boolean): Focus | undefined {
  const [side, setSide] = useState<Side>("new");

  return useMemo(
    () =>
      sideBySide
        ? {
            side,
            onFocus: (pressed) => {
              if (pressed !== side) {
                clearSelection();
              }

              setSide(pressed);
            },
          }
        : undefined,
    [sideBySide, side],
  );
}

// What a diff's hunks' bars do, with their hunk's index.
interface BarActions {
  onToggleEntire: (hunk: number) => void;
  onHeight: (height: number) => void;
  onRun: (hunk: number) => void;
}

// What the bars act with, as the latest render gives it.
interface BarState {
  entire: boolean;
  // Holds the place of what the element with the id marks.
  hold: (mark: string) => void;
  onHunkRun: DiffBodyProps["onHunkRun"];
}

// The bars' actions, the same each render, with what the latest render gives them, so that a change
// that reaches only some hunks, as the selection's does, renders only their bars again. Toggling the
// entire file keeps the hunk in place, and so does an action on a hunk while the entire file shows,
// where the next hunk takes its place.
function useBarActions(
  container: string,
  state: BarState,
  setEntire: Dispatch<SetStateAction<boolean>>,
): BarActions {
  const latest = useLatest(state);
  const barHeight = useRef(0);

  return useMemo(
    () => ({
      onToggleEntire: (hunk) => {
        latest.current.hold(hunkId(container, hunk));
        setEntire((entire) => !entire);
      },
      onHeight: (height) => {
        barHeight.current = height;
      },
      onRun: (hunk) => {
        const { entire, hold, onHunkRun } = latest.current;

        onHunkRun(hunkId(container, hunk), barHeight.current);

        if (entire) {
          hold(hunkId(container, hunk));
        }
      },
    }),
    [container, setEntire, latest],
  );
}

// The diff to show: read again with every line of the file while the entire file is asked for, once
// that's read, and else as it is.
function useEntireDiff(diff: Diff, query: DiffBodyProps["entireQuery"], entire: boolean): Diff {
  const whole = useQuery({ ...query, enabled: entire });

  return entire ? (whole.data ?? diff) : diff;
}

// The lines outside a hunk while only the hunks show, the same each time, so the hunk's lines
// rendered again with them aren't rendered again for them.
const noLines: NumberedLine[] = [];

interface HunksProps extends DiffBodyProps {
  styles: Styles;
}

// Each hunk's bar is followed by its lines. The pointer over either reveals the hunk's actions, and
// the toggle that shows the entire file, with the unchanged lines around the hunks, once the diff is
// read again with them, or only the hunks again, which keeps the hunk in place. Hunks that scroll on their own have each bar stay at
// the top while its lines scroll under it, until the next hunk's bar covers it. While the entire
// file shows, the next hunk takes the place of one an action is run on. Side by side, the selection
// is in the side with focus. The pointer moving from one hunk to another renders only their bars
// again, and the selection changing only the hunks it leaves or reaches.
function Hunks({
  diff,
  file,
  view,
  fileIndex,
  selection,
  scrolls,
  entireQuery,
  sideBySide,
  onHunkRun,
  controls,
  styles,
  theme,
}: HunksProps): ReactElement {
  const pointed = useMemo(() => pointedHunk(), []);
  const [entire, setEntire] = useState(false);
  const shownDiff = useEntireDiff(diff, entireQuery, entire);
  const showsEntire = shownDiff !== diff;
  const container = fileId(view, fileIndex);
  const key = `${shownDiff.version} ${String(showsEntire)}`;
  const hold = useHeldPlace(view, key, controls.busy);
  const bars = useBarActions(container, { entire, hold, onHunkRun }, setEntire);

  const unchanged = useMemo(
    () => (showsEntire ? unchangedLines(shownDiff) : { before: noLines, after: [] }),
    [shownDiff, showsEntire],
  );

  const focus = useFocus(sideBySide);
  const range = useMemo(() => onSide(selection, focus), [selection, focus]);

  const hunks = shownDiff.hunks.flatMap((hunk, index) => {
    const selected = rangeInHunk(range, index);

    return [
      <HunkBar
        key={`bar ${hunk.oldStart},${hunk.newStart}`}
        hunk={hunk}
        index={index}
        version={shownDiff.version}
        file={file}
        selection={selected}
        pointed={pointed}
        controls={controls}
        entire={entire}
        onToggleEntire={bars.onToggleEntire}
        onHeight={bars.onHeight}
        onRun={bars.onRun}
        theme={theme}
      />,
      <View key={`lines ${hunk.oldStart},${hunk.newStart}`} style={styles.spaced}>
        <View nativeID={hunkId(container, index)} />
        <HunkLines
          hunk={hunk}
          index={index}
          container={container}
          selection={selected}
          pointed={pointed}
          focus={focus}
          highlights={shownDiff.highlights}
          theme={theme}
        />
        <UnchangedLines
          lines={unchanged.after[index] ?? noLines}
          focus={focus}
          highlights={shownDiff.highlights}
          theme={theme}
        />
      </View>,
    ];
  });

  const shown = [
    <UnchangedLines
      key="before"
      lines={unchanged.before}
      focus={focus}
      highlights={shownDiff.highlights}
      style={styles.spaced}
      theme={theme}
    />,
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

// The diff's mode change, if it has one, above its hunks, or what's shown instead of a diff without
// lines, with a button that shows a collapsed one's.
export function DiffBody(props: DiffBodyProps): ReactElement {
  const { diff, file, controls, onExpand, theme } = props;
  const styles = useStyles(theme);
  const label = labelOf(diff);

  return (
    <>
      {diff.mode === undefined ? null : (
        <ModeBar
          mode={diff.mode}
          version={diff.version}
          file={file}
          controls={controls}
          theme={theme}
        />
      )}
      {label === undefined ? (
        <Hunks {...props} styles={styles} />
      ) : (
        <LabelRow label={label} diff={diff} onExpand={onExpand} styles={styles} theme={theme} />
      )}
    </>
  );
}
