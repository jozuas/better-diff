import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { diffRpc } from "../shared/diff";
import type { Controls } from "./actions";
import { HunkLines, UnchangedLines } from "./diff-lines";
import type { OpenFile } from "./groups";
import { Hoverable, TintLayer } from "./hoverable";
import { HunkBar } from "./hunk-bar";
import type { PointerHandlers } from "./hunk-bar";
import { labelOf } from "./labels";
import { unchangedLines } from "./lines";
import { ModeBar } from "./mode-bar";
import { fileId, hunkId, onSide } from "./selection";
import type { LineRange } from "./selection";
import type { Focus, Side } from "./side-by-side";
import { clearSelection, offsetIn, scrollToOffset } from "./web";

type Diff = RpcOutput<typeof diffRpc>;

function useStyles(theme: PluginTheme) {
  return useMemo(
    () =>
      StyleSheet.create({
        labelRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
        label: { color: theme.colors.foregroundMuted },
        expand: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 4, overflow: "hidden" },
        expandText: { fontSize: 12, color: theme.colors.foreground },
        // Under each hunk, and the unchanged lines before the first.
        spaced: { marginBottom: 8 },
      }),
    [theme],
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

// Where a hunk was in a view, by how far below its top the hunk's first line was, while it showed
// what `shown` says.
interface Place {
  hunk: number;
  offset: number;
  shown: string;
}

// Holds a hunk's place in the view with the id `view`. Once what the view shows of the diff,
// `shown`, changes, the view scrolls to show the hunk with the same index in that place: the hunk
// itself, once the view shows more or less of the file around it, or the next one, once an action
// has taken it out of the diff.
function useHunkPlace(view: string, container: string, shown: string): (hunk: number) => void {
  const held = useRef<Place | undefined>(undefined);

  useLayoutEffect(() => {
    const place = held.current;

    if (place !== undefined && place.shown !== shown) {
      held.current = undefined;
      scrollToOffset(view, hunkId(container, place.hunk), place.offset);
    }
  }, [view, container, shown]);

  return (hunk) => {
    const offset = offsetIn(view, hunkId(container, hunk));

    held.current = offset === undefined ? undefined : { hunk, offset, shown };
  };
}

// Side by side, which side has focus: the one the pointer was last pressed on, the new version's
// until it is. Undefined inline. Pressing the pointer on the other side clears the selection, which
// the page's order of the sides' lines has that side's lines in, so the press starts a selection
// rather than dragging the one there was.
function useFocus(sideBySide: boolean): Focus | undefined {
  const [side, setSide] = useState<Side>("new");

  return sideBySide
    ? {
        side,
        onFocus: (pressed) => {
          if (pressed !== side) {
            clearSelection();
          }

          setSide(pressed);
        },
      }
    : undefined;
}

interface HunksProps extends DiffBodyProps {
  styles: Styles;
}

// Each hunk's bar is followed by its lines. The pointer over either reveals the hunk's actions, and
// the toggle that shows the entire file, with the unchanged lines around the hunks, or only the
// hunks again, which keeps the hunk in place. Hunks that scroll on their own have each bar stay at
// the top while its lines scroll under it, until the next hunk's bar covers it. While the entire
// file shows, the next hunk takes the place of one an action is run on. Side by side, the selection
// is in the side with focus.
function Hunks({
  diff,
  file,
  view,
  fileIndex,
  selection,
  scrolls,
  sideBySide,
  onHunkRun,
  controls,
  styles,
  theme,
}: HunksProps): ReactElement {
  const [pointed, setPointed] = useState<number>();
  const [entire, setEntire] = useState(false);
  const barHeight = useRef(0);
  const container = fileId(view, fileIndex);
  const hold = useHunkPlace(view, container, `${diff.version} ${String(entire)}`);
  const unchanged = entire ? unchangedLines(diff) : { before: [], after: [] };
  const focus = useFocus(sideBySide);
  const range = onSide(selection, focus);

  const hunks = diff.hunks.flatMap((hunk, index) => {
    const pointer: PointerHandlers = {
      onPointerEnter: () => {
        setPointed(index);
      },
      onPointerLeave: () => {
        setPointed(undefined);
      },
    };

    return [
      <HunkBar
        key={`bar ${hunk.oldStart},${hunk.newStart}`}
        hunk={hunk}
        index={index}
        version={diff.version}
        file={file}
        selection={range}
        pointed={pointed}
        pointer={pointer}
        controls={controls}
        entire={entire}
        onToggleEntire={() => {
          hold(index);
          setEntire(!entire);
        }}
        onHeight={(height) => {
          barHeight.current = height;
        }}
        onRun={() => {
          onHunkRun(hunkId(container, index), barHeight.current);

          if (entire) {
            hold(index);
          }
        }}
        theme={theme}
      />,
      <View key={`lines ${hunk.oldStart},${hunk.newStart}`} style={styles.spaced}>
        <View nativeID={hunkId(container, index)} />
        <HunkLines
          hunk={hunk}
          index={index}
          container={container}
          selection={range}
          pointer={pointer}
          focus={focus}
          theme={theme}
        />
        <UnchangedLines lines={unchanged.after[index] ?? []} focus={focus} theme={theme} />
      </View>,
    ];
  });

  const shown = [
    <UnchangedLines
      key="before"
      lines={unchanged.before}
      focus={focus}
      style={styles.spaced}
      theme={theme}
    />,
    ...hunks,
  ];

  return scrolls ? (
    <ScrollView nativeID={view} stickyHeaderIndices={diff.hunks.map((_, index) => 2 * index + 1)}>
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
