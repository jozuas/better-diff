import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { memo, useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";

import type { diffRpc } from "../shared/diff";
import type { TextRange } from "./changed-text";
import { changedWordsOf } from "./changed-words";
import { DiffLine } from "./diff-line";
import { useStyles } from "./diff-styles";
import type { Styles } from "./diff-styles";
import { numberLines } from "./lines";
import type { NumberedLine } from "./lines";
import type { PointedHunk } from "./pointed";
import { isSelected, lineId } from "./selection";
import type { LineRange } from "./selection";
import { rowsOf, sides } from "./side-by-side";
import type { Focus, Row, Side } from "./side-by-side";
import type { Highlights } from "./syntax";

declare module "react-native" {
  interface ViewStyle {
    // CSS's, which React Native Web passes on.
    contain?: "content";
  }
}

// Has the browser lay out and paint the lines apart from the rest of the view, and look for what's
// under the pointer among them only while it's over them: without it, each move of the pointer
// over a diff of thousands of lines takes the browser as long as all of them.
const contained: ViewStyle = { contain: "content" };

type Hunk = RpcOutput<typeof diffRpc>["hunks"][number];

// The changed text of a line that has none, the same each time, so a line rendered again with it
// isn't rendered again for it.
const unchanged: readonly TextRange[] = [];

// Which lines are selected, by their indices among those shown and, side by side, their side.
type Selected = (index: number, side?: Side) => boolean;

// The changed text of each line, by its index among those shown.
type ChangedText = (index: number) => readonly TextRange[];

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
  highlights: Highlights;
  changes: ChangedText;
  styles: Styles;
}

// A side of a side-by-side row. Pressing the pointer on it gives its side focus.
function Half({
  side,
  shown,
  idOf,
  focused,
  selected,
  focus,
  highlights,
  changes,
  styles,
}: HalfProps): ReactElement {
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
          highlights={highlights}
          changes={changes(shown.index)}
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
  highlights: Highlights;
  changes: ChangedText;
  styles: Styles;
}

// Each side's line level with the other's. Only the text of the side with focus can be selected,
// and has the ids a selection finds lines by, so a selection has only that side's.
function SideBySideRow({
  row,
  idOf,
  selected,
  focus,
  highlights,
  changes,
  styles,
}: SideBySideRowProps): ReactElement {
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
          highlights={highlights}
          changes={changes}
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
  highlights: Highlights;
  changes: ChangedText;
  styles: Styles;
}

// The lines one under the other, or side by side.
function Lines({
  lines,
  idOf,
  selected,
  focus,
  highlights,
  changes,
  styles,
}: LinesProps): ReactElement[] {
  if (focus === undefined) {
    return lines.map((line, index) => (
      <DiffLine
        key={`${line.oldNumber},${line.newNumber}`}
        id={idOf?.(index, true)}
        line={line}
        selected={selected(index)}
        side={undefined}
        selectable
        highlights={highlights}
        changes={changes(index)}
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
      highlights={highlights}
      changes={changes}
      styles={styles}
    />
  ));
}

interface HunkLinesProps {
  hunk: Hunk;
  index: number;
  container: string;
  // Its lines the page's text selection touches, if any.
  selection: LineRange | undefined;
  // Which of the diff's hunks the pointer is over.
  pointed: PointedHunk;
  // Undefined for an inline view.
  focus: Focus | undefined;
  // The diff's.
  highlights: Highlights;
  theme: PluginTheme;
}

function LinesOfHunk({
  hunk,
  index,
  container,
  selection,
  pointed,
  focus,
  highlights,
  theme,
}: HunkLinesProps): ReactElement {
  const styles = useStyles(theme);
  const lines = useMemo(() => numberLines(hunk), [hunk]);
  const changes = useMemo(() => changedWordsOf(lines), [lines]);

  return (
    <View style={contained} {...pointed.pointer(index)}>
      <Lines
        lines={lines}
        idOf={(line, focused) => lineId(container, index, line, focused)}
        selected={(line, side) => isSelected(selection, index, line, side)}
        focus={focus}
        highlights={highlights}
        changes={(line) => changes[line] ?? unchanged}
        styles={styles}
      />
    </View>
  );
}

// Rendered again only once what it's rendered with changes, as the text selection reaching into the
// hunk or leaving it does, and not as it changes in other hunks.
export const HunkLines = memo(LinesOfHunk);

interface UnchangedLinesProps {
  lines: NumberedLine[];
  // Undefined for an inline view.
  focus: Focus | undefined;
  // The diff's.
  highlights: Highlights;
  style?: StyleProp<ViewStyle>;
  theme: PluginTheme;
}

// Lines of the file outside its hunks, if there are any. A selection can copy them, but leaves
// them out of the lines it selects.
function LinesOutsideHunks({
  lines,
  focus,
  highlights,
  style,
  theme,
}: UnchangedLinesProps): ReactElement | null {
  const styles = useStyles(theme);

  return lines.length === 0 ? null : (
    <View style={[style, contained]}>
      <Lines
        lines={lines}
        idOf={undefined}
        selected={() => false}
        focus={focus}
        highlights={highlights}
        changes={() => unchanged}
        styles={styles}
      />
    </View>
  );
}

// Rendered again only once what it's rendered with changes.
export const UnchangedLines = memo(LinesOutsideHunks);
