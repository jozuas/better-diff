import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { diffRpc } from "../shared/diff";
import type { Controls } from "./actions";
import type { OpenFile } from "./groups";
import { HunkBar } from "./hunk-bar";
import type { PointerHandlers } from "./hunk-bar";
import { labelOf } from "./labels";
import { numberLines } from "./lines";
import type { NumberedLine } from "./lines";
import { ModeBar } from "./mode-bar";
import { fileId, isSelected, lineId } from "./selection";
import type { LineRange } from "./selection";

type Diff = RpcOutput<typeof diffRpc>;

// Paseo's own monospace fonts.
const monospace =
  "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

function useStyles(theme: PluginTheme) {
  return useMemo(
    () =>
      StyleSheet.create({
        labelRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
        label: { color: theme.colors.foregroundMuted },
        expand: {
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 4,
          borderWidth: 1,
          borderColor: theme.colors.foreground,
        },
        expandText: { fontSize: 12, color: theme.colors.foreground },
        hunkLines: { marginBottom: 8 },
        line: { flexDirection: "row" },
        // Under a line, tinting it as removed or added.
        tint: { ...StyleSheet.absoluteFillObject, opacity: 0.15 },
        context: { backgroundColor: "transparent" },
        removed: { backgroundColor: theme.colors.statusDanger },
        added: { backgroundColor: theme.colors.statusSuccess },
        number: {
          width: 44,
          paddingRight: 8,
          textAlign: "right",
          fontFamily: monospace,
          fontSize: 12,
          lineHeight: 18,
          color: theme.colors.foregroundMuted,
        },
        selected: { color: theme.colors.surface0, backgroundColor: theme.colors.foregroundMuted },
        text: {
          flex: 1,
          paddingHorizontal: 8,
          fontFamily: monospace,
          fontSize: 12,
          lineHeight: 18,
          color: theme.colors.foreground,
        },
        noNewline: {
          paddingLeft: 96,
          fontSize: 11,
          lineHeight: 18,
          color: theme.colors.foregroundMuted,
        },
      }),
    [theme],
  );
}

type Styles = ReturnType<typeof useStyles>;

interface DiffLineProps {
  id: string;
  line: NumberedLine;
  selected: boolean;
  styles: Styles;
}

// Only the line's text can be selected, so copying a selection copies what the lines say. The
// numbers of a selected line stand out.
function DiffLine({ id, line, selected, styles }: DiffLineProps): ReactElement {
  const number = selected ? [styles.number, styles.selected] : styles.number;

  return (
    <View>
      <View style={styles.line}>
        <View style={[styles.tint, styles[line.kind]]} />
        <Text selectable={false} style={number}>
          {line.oldNumber}
        </Text>
        <Text selectable={false} style={number}>
          {line.newNumber}
        </Text>
        <Text nativeID={id} selectable style={styles.text}>
          {line.text}
        </Text>
      </View>
      {line.newline ? null : (
        <Text selectable={false} style={styles.noNewline}>
          No newline at end of file
        </Text>
      )}
    </View>
  );
}

interface HunkLinesProps {
  hunk: Diff["hunks"][number];
  index: number;
  container: string;
  selection: LineRange | undefined;
  pointer: PointerHandlers;
  styles: Styles;
}

function HunkLines({
  hunk,
  index,
  container,
  selection,
  pointer,
  styles,
}: HunkLinesProps): ReactElement {
  return (
    <View style={styles.hunkLines} {...pointer}>
      {numberLines(hunk).map((line, lineIndex) => (
        <DiffLine
          key={`${line.oldNumber},${line.newNumber}`}
          id={lineId(container, index, lineIndex)}
          line={line}
          selected={isSelected(selection, index, lineIndex)}
          styles={styles}
        />
      ))}
    </View>
  );
}

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
  // Called just before an action on one of its hunks runs, with the id of the hunk's first line and
  // the height of its bar.
  onHunkRun: (line: string, barHeight: number) => void;
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
}

// What's shown instead of a diff without lines, with a button that shows a collapsed one's.
function LabelRow({ label, diff, onExpand, styles }: LabelRowProps): ReactElement {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{label}</Text>
      {diff.collapsed === undefined ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show diff"
          style={styles.expand}
          onPress={onExpand}
        >
          <Text selectable={false} style={styles.expandText}>
            Show diff
          </Text>
        </Pressable>
      )}
    </View>
  );
}

interface HunksProps extends DiffBodyProps {
  styles: Styles;
}

// Each hunk's bar is followed by its lines. The pointer over either reveals the hunk's actions. Hunks
// that scroll on their own have each bar stay at the top while its lines scroll under it, until the
// next hunk's bar covers it.
function Hunks({
  diff,
  file,
  view,
  fileIndex,
  selection,
  scrolls,
  onHunkRun,
  controls,
  onExpand,
  styles,
  theme,
}: HunksProps): ReactElement {
  const [pointed, setPointed] = useState<number>();
  const barHeight = useRef(0);
  const container = fileId(view, fileIndex);
  const label = labelOf(diff);

  if (label !== undefined) {
    return <LabelRow label={label} diff={diff} onExpand={onExpand} styles={styles} />;
  }

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
        selection={selection}
        pointed={pointed}
        pointer={pointer}
        controls={controls}
        onHeight={(height) => {
          barHeight.current = height;
        }}
        onRun={() => {
          onHunkRun(lineId(container, index, 0), barHeight.current);
        }}
        theme={theme}
      />,
      <HunkLines
        key={`lines ${hunk.oldStart},${hunk.newStart}`}
        hunk={hunk}
        index={index}
        container={container}
        selection={selection}
        pointer={pointer}
        styles={styles}
      />,
    ];
  });

  return scrolls ? (
    <ScrollView nativeID={view} stickyHeaderIndices={diff.hunks.map((_, index) => 2 * index)}>
      {hunks}
    </ScrollView>
  ) : (
    <View>{hunks}</View>
  );
}

// The diff's mode change, if it has one, above its hunks, or what's shown instead of a diff without
// lines, with a button that shows a collapsed one's.
export function DiffBody(props: DiffBodyProps): ReactElement {
  const { diff, file, controls, theme } = props;
  const styles = useStyles(theme);

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
      <Hunks {...props} styles={styles} />
    </>
  );
}
