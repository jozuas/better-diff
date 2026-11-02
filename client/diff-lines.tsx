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
import { numbersOf, rowsOf, sides } from "./side-by-side";
import type { Focus, Row, Side } from "./side-by-side";

declare module "react-native" {
  interface ViewProps {
    // React Native Web's: each entry becomes a data- attribute of the element.
    dataSet?: Readonly<Record<string, string>>;
  }
}

type Hunk = RpcOutput<typeof diffRpc>["hunks"][number];

// Paseo's own monospace fonts.
const monospace =
  "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

// Paseo sets its UI font on everything in the app but what's marked data-pmono, and inside it, over
// any font family the plugin gives.
const paseoMonospace = { pmono: "" };

// The width of a line's number, and the room either side of its text.
const numberWidth = 44;
const textPadding = 8;

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
          width: numberWidth,
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
          paddingHorizontal: textPadding,
          fontFamily: monospace,
          fontSize: 12,
          lineHeight: 18,
          color: theme.colors.foreground,
        },
        noNewline: { fontSize: 11, lineHeight: 18, color: theme.colors.foregroundMuted },
        // Each side of a side-by-side row, with a line between them.
        half: { flex: 1, minWidth: 0 },
        old: {},
        new: { borderLeftWidth: 1, borderColor: theme.colors.border },
        // Where a side has no line level with the other's.
        filler: { flex: 1, backgroundColor: theme.colors.surface1 },
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
  // The side it shows on, with only that version's number, or undefined inline, with both.
  side: Side | undefined;
  selectable: boolean;
  styles: Styles;
}

// Only the line's text can be selected, so copying a selection copies what the lines say. The
// numbers of a selected line stand out.
function DiffLine({ id, line, selected, side, selectable, styles }: DiffLineProps): ReactElement {
  const numbers = numbersOf(line, side);
  const numberStyle = selected ? [styles.number, styles.selected] : styles.number;

  return (
    <View>
      <View dataSet={paseoMonospace} style={styles.line}>
        <View style={[styles.tint, styles[line.kind]]} />
        {numbers.map(({ side: version, number }) => (
          <Text key={version} selectable={false} style={numberStyle}>
            {number}
          </Text>
        ))}
        <Text nativeID={id} selectable={selectable} style={styles.text}>
          {line.text}
        </Text>
      </View>
      {line.newline ? null : (
        <Text
          selectable={false}
          style={[styles.noNewline, { paddingLeft: numbers.length * numberWidth + textPadding }]}
        >
          No newline at end of file
        </Text>
      )}
    </View>
  );
}

// Which lines are selected, by their indices among those shown and, side by side, their side.
type Selected = (index: number, side?: Side) => boolean;

// The id of a line's text, by its index and whether its side has focus. One without focus has an
// id a selection doesn't find it by.
type IdOf = (index: number, focused: boolean) => string;

interface HalfProps {
  side: Side;
  // The line the side shows in the row, if any.
  shown: Row[Side];
  idOf: IdOf | undefined;
  // Whether its side has focus, which only it can be selected on.
  focused: boolean;
  selected: Selected;
  focus: Focus;
  styles: Styles;
}

// A side of a side-by-side row. Pressing the pointer on it gives its side focus.
function Half({ side, shown, idOf, focused, selected, focus, styles }: HalfProps): ReactElement {
  return (
    <View
      style={[styles.half, styles[side]]}
      onPointerDown={() => {
        focus.onFocus(side);
      }}
    >
      {shown === undefined ? (
        <View style={styles.filler} />
      ) : (
        <DiffLine
          id={idOf?.(shown.index, focused)}
          line={shown.line}
          selected={selected(shown.index, side)}
          side={side}
          selectable={focused}
          styles={styles}
        />
      )}
    </View>
  );
}

interface SideBySideRowProps {
  row: Row;
  idOf: IdOf | undefined;
  selected: Selected;
  focus: Focus;
  styles: Styles;
}

// Each side's line level with the other's. Only the text of the side with focus can be selected,
// and has the ids a selection finds lines by, so a selection has only that side's.
function SideBySideRow({ row, idOf, selected, focus, styles }: SideBySideRowProps): ReactElement {
  return (
    <View style={styles.line}>
      {sides.map((side) => (
        <Half
          key={side}
          side={side}
          shown={row[side]}
          idOf={idOf}
          focused={focus.side === side}
          selected={selected}
          focus={focus}
          styles={styles}
        />
      ))}
    </View>
  );
}

interface LinesProps {
  lines: NumberedLine[];
  // None for lines outside the hunks.
  idOf: IdOf | undefined;
  selected: Selected;
  // Undefined for an inline view.
  focus: Focus | undefined;
  styles: Styles;
}

// The lines one under the other, or side by side.
function Lines({ lines, idOf, selected, focus, styles }: LinesProps): ReactElement[] {
  if (focus === undefined) {
    return lines.map((line, index) => (
      <DiffLine
        key={`${line.oldNumber},${line.newNumber}`}
        id={idOf?.(index, true)}
        line={line}
        selected={selected(index)}
        side={undefined}
        selectable
        styles={styles}
      />
    ));
  }

  return rowsOf(lines).map((row) => (
    <SideBySideRow
      key={`${row.old?.line.oldNumber},${row.new?.line.newNumber}`}
      row={row}
      idOf={idOf}
      selected={selected}
      focus={focus}
      styles={styles}
    />
  ));
}

interface HunkLinesProps {
  hunk: Hunk;
  index: number;
  container: string;
  selection: LineRange | undefined;
  pointer: PointerHandlers;
  // Undefined for an inline view.
  focus: Focus | undefined;
  theme: PluginTheme;
}

export function HunkLines({
  hunk,
  index,
  container,
  selection,
  pointer,
  focus,
  theme,
}: HunkLinesProps): ReactElement {
  const styles = useStyles(theme);

  return (
    <View {...pointer}>
      <Lines
        lines={numberLines(hunk)}
        idOf={(line, focused) => lineId(container, index, line, focused)}
        selected={(line, side) => isSelected(selection, index, line, side)}
        focus={focus}
        styles={styles}
      />
    </View>
  );
}

interface UnchangedLinesProps {
  lines: NumberedLine[];
  // Undefined for an inline view.
  focus: Focus | undefined;
  style?: StyleProp<ViewStyle>;
  theme: PluginTheme;
}

// Lines of the file outside its hunks, if there are any. A selection can copy them, but leaves
// them out of the lines it selects.
export function UnchangedLines({
  lines,
  focus,
  style,
  theme,
}: UnchangedLinesProps): ReactElement | null {
  const styles = useStyles(theme);

  return lines.length === 0 ? null : (
    <View style={style}>
      <Lines lines={lines} idOf={undefined} selected={() => false} focus={focus} styles={styles} />
    </View>
  );
}
