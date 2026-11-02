import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
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
import { isSelected, lineId, sameRange, selectedRange } from "./selection";
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

interface DiffBodyProps {
  diff: Diff;
  file: OpenFile;
  controls: Controls;
  // Asks for a collapsed diff's lines.
  onExpand: () => void;
  theme: PluginTheme;
}

interface HunksProps extends DiffBodyProps {
  styles: Styles;
}

// Each hunk's bar is followed by its lines, and stays at the top while they scroll under it, until
// the next hunk's bar covers it. The pointer over either reveals the hunk's actions. Just before an
// action on a hunk runs, the view scrolls up to the hunk's start if it's above, so the next hunk,
// which then takes its place, shows from its start.
function Hunks({ diff, file, controls, onExpand, styles, theme }: HunksProps): ReactElement {
  const container = useId();
  const selection = useSelectedLines(container);
  const [pointed, setPointed] = useState<number>();
  const barHeight = useRef(0);
  const label = labelOf(diff);

  if (label !== undefined) {
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

  return (
    <ScrollView nativeID={container} stickyHeaderIndices={diff.hunks.map((_, index) => 2 * index)}>
      {diff.hunks.flatMap((hunk, index) => {
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
              scrollUpTo(container, lineId(container, index, 0), barHeight.current);
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
      })}
    </ScrollView>
  );
}

// The diff's mode change, if it has one, above its hunks, or what's shown instead of a diff without
// lines, with a button that shows a collapsed one's.
export function DiffBody({ diff, file, controls, onExpand, theme }: DiffBodyProps): ReactElement {
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
      <Hunks
        diff={diff}
        file={file}
        controls={controls}
        onExpand={onExpand}
        styles={styles}
        theme={theme}
      />
    </>
  );
}
