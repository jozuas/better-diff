import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";

import type { diffRpc } from "../shared/diff";
import type { PointerHandlers } from "./hunk-bar";
import { numberLines } from "./lines";
import type { NumberedLine } from "./lines";
import { isSelected, lineId } from "./selection";
import type { LineRange } from "./selection";

type Hunk = RpcOutput<typeof diffRpc>["hunks"][number];

// Paseo's own monospace fonts.
const monospace =
  "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

function useStyles(theme: PluginTheme) {
  return useMemo(
    () =>
      StyleSheet.create({
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
  // A hunk's line's, by which a selection finds it.
  id: string | undefined;
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
  hunk: Hunk;
  index: number;
  container: string;
  selection: LineRange | undefined;
  pointer: PointerHandlers;
  theme: PluginTheme;
}

export function HunkLines({
  hunk,
  index,
  container,
  selection,
  pointer,
  theme,
}: HunkLinesProps): ReactElement {
  const styles = useStyles(theme);

  return (
    <View {...pointer}>
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

interface UnchangedLinesProps {
  lines: NumberedLine[];
  style?: StyleProp<ViewStyle>;
  theme: PluginTheme;
}

// Lines of the file outside its hunks, if there are any. A selection can copy them, but leaves
// them out of the lines it selects.
export function UnchangedLines({ lines, style, theme }: UnchangedLinesProps): ReactElement | null {
  const styles = useStyles(theme);

  return lines.length === 0 ? null : (
    <View style={style}>
      {lines.map((line) => (
        <DiffLine
          key={`${line.oldNumber},${line.newNumber}`}
          id={undefined}
          line={line}
          selected={false}
          styles={styles}
        />
      ))}
    </View>
  );
}
