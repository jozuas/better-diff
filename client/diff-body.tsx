import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { diffRpc } from "../shared/diff";
import { ActionButtons } from "./action-buttons";
import { hunkActions, hunkLines, lineActions } from "./actions";
import type { Controls } from "./actions";
import type { GroupName } from "./groups";
import { labelOf } from "./labels";
import { numberLines } from "./lines";
import type { NumberedLine } from "./lines";
import { isSelected, lineId, rangeLines, sameRange, selectedRange } from "./selection";
import type { LineRange } from "./selection";
import { onSelection, scrollUpTo } from "./web";

type Diff = RpcOutput<typeof diffRpc>;

// Paseo's own monospace fonts.
const monospace =
  "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

function useStyles(theme: PluginTheme) {
  return useMemo(
    () =>
      StyleSheet.create({
        label: { padding: 16, color: theme.colors.foregroundMuted },
        // Opaque, since it stays over the hunk's lines as they scroll under it.
        hunkBar: {
          flexDirection: "row",
          paddingHorizontal: 12,
          paddingVertical: 3,
          backgroundColor: theme.colors.surface0,
        },
        hunkTint: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: theme.colors.accent,
          opacity: 0.25,
        },
        hunkButtons: { flexDirection: "row", gap: 6, marginLeft: "auto" },
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
        selected: { color: theme.colors.accentForeground, backgroundColor: theme.colors.accent },
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

// The lines of the container's diff that the page's text selection touches.
function useSelectedLines(container: string): LineRange | undefined {
  const [range, setRange] = useState<LineRange>();

  useEffect(
    () =>
      onSelection(container, (touched, anchor) => {
        const next = selectedRange(container, touched, anchor);

        setRange((current) => (sameRange(current, next) ? current : next));
      }),
    [container],
  );

  return range;
}

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

interface HunkBarProps {
  hunk: Diff["hunks"][number];
  index: number;
  version: string;
  group: GroupName;
  selection: LineRange | undefined;
  controls: Controls;
  // Hears the bar's height.
  onHeight: (height: number) => void;
  // Called just before an action on the hunk runs.
  onRun: () => void;
  styles: Styles;
  theme: PluginTheme;
}

// A hunk's actions, and those on its selected lines while it has any.
function HunkBar({
  hunk,
  index,
  version,
  group,
  selection,
  controls,
  onHeight,
  onRun,
  styles,
  theme,
}: HunkBarProps): ReactElement {
  return (
    <View
      style={styles.hunkBar}
      onLayout={(event) => {
        onHeight(event.nativeEvent.layout.height);
      }}
    >
      <View style={styles.hunkTint} />
      <View style={styles.hunkButtons}>
        {selection?.hunk === index ? (
          <ActionButtons
            actions={lineActions[group]}
            bar={`${version}:lines ${index}:${selection.first}-${selection.last}`}
            target={{ version, lines: rangeLines(selection) }}
            controls={controls}
            color={theme.colors.foreground}
            theme={theme}
          />
        ) : null}
        <ActionButtons
          actions={hunkActions[group]}
          bar={`${version}:hunk ${index}`}
          target={{ version, lines: hunkLines(hunk.lines, index) }}
          controls={controls}
          onRun={onRun}
          color={theme.colors.foreground}
          theme={theme}
        />
      </View>
    </View>
  );
}

interface HunkLinesProps {
  hunk: Diff["hunks"][number];
  index: number;
  container: string;
  selection: LineRange | undefined;
  styles: Styles;
}

function HunkLines({ hunk, index, container, selection, styles }: HunkLinesProps): ReactElement {
  return (
    <View style={styles.hunkLines}>
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

interface DiffBodyProps {
  diff: Diff;
  group: GroupName;
  controls: Controls;
  theme: PluginTheme;
}

// The diff's hunks, or what's shown instead of a diff without lines. Each hunk's bar is followed by
// its lines, and stays at the top while they scroll under it, until the next hunk's bar covers it.
// Just before an action on a hunk runs, the view scrolls up to the hunk's start if it's above, so
// the next hunk, which then takes its place, shows from its start.
export function DiffBody({ diff, group, controls, theme }: DiffBodyProps): ReactElement {
  const styles = useStyles(theme);
  const container = useId();
  const selection = useSelectedLines(container);
  const barHeight = useRef(0);
  const label = labelOf(diff);

  if (label !== undefined) {
    return <Text style={styles.label}>{label}</Text>;
  }

  return (
    <ScrollView nativeID={container} stickyHeaderIndices={diff.hunks.map((_, index) => 2 * index)}>
      {diff.hunks.flatMap((hunk, index) => [
        <HunkBar
          key={`bar ${hunk.oldStart},${hunk.newStart}`}
          hunk={hunk}
          index={index}
          version={diff.version}
          group={group}
          selection={selection}
          controls={controls}
          onHeight={(height) => {
            barHeight.current = height;
          }}
          onRun={() => {
            scrollUpTo(container, lineId(container, index, 0), barHeight.current);
          }}
          styles={styles}
          theme={theme}
        />,
        <HunkLines
          key={`lines ${hunk.oldStart},${hunk.newStart}`}
          hunk={hunk}
          index={index}
          container={container}
          selection={selection}
          styles={styles}
        />,
      ])}
    </ScrollView>
  );
}
