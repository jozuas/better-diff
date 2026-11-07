import type { ReactElement } from "react";
import { memo, useContext } from "react";
import { View } from "react-native";

import type { TextRange } from "./changed-text";
import { DiffLine } from "./diff-line";
import type { Styles } from "./diff-styles";
import type { FoundRange } from "./find";
import { FontSizesContext } from "./fonts";
import { lineKey } from "./lines";
import type { IndexedLine, NumberedLine } from "./lines";
import { blockTall } from "./rendering";
import { rowKey, sides } from "./side-by-side";
import type { Focus, Row, Side } from "./side-by-side";

declare module "react-native" {
  interface ViewStyle {
    // CSS's, which React Native Web passes on.
    contentVisibility?: "auto";
    containIntrinsicSize?: string;
  }
}

// Which lines are selected, by their indices among those shown and, side by side, their side.
export type Selected = (index: number, side?: Side) => boolean;

// The changed text of each line, by its index among those shown.
export type ChangedText = (index: number) => readonly TextRange[];

// What the find bar found in each line, by its index among those shown.
export type FoundText = (index: number) => readonly FoundRange[];

// The id of a line's text, by the line, with its index, and whether its side has focus. One without
// focus has an id a selection doesn't find it by.
export type IdOf = (line: IndexedLine, focused: boolean) => string;

// Lines shown side by side: their rows, and the side with focus.
interface SideBySide {
  rows: readonly Row[];
  focus: Focus;
}

interface HalfProps {
  side: Side;
  // The line the side shows in the row, if any.
  shown: Row[Side];
  idOf: IdOf;
  // Whether its side has focus, which only it can be selected on.
  focused: boolean;
  selected: Selected;
  focus: Focus;
  changes: ChangedText;
  found: FoundText;
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
  changes,
  found,
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
          id={idOf(shown, focused)}
          line={shown.line}
          selected={selected(shown.index, side)}
          side={side}
          selectable={focused}
          changes={changes(shown.index)}
          found={found(shown.index)}
          styles={styles}
        />
      )}
    </View>
  );
}

interface SideBySideRowProps {
  row: Row;
  idOf: IdOf;
  selected: Selected;
  focus: Focus;
  changes: ChangedText;
  found: FoundText;
  styles: Styles;
}

// Each side's line level with the other's. Only the text of the side with focus can be selected,
// and has the ids a selection finds lines by, so a selection has only that side's.
function SideBySideRow({
  row,
  idOf,
  selected,
  focus,
  changes,
  found,
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
          changes={changes}
          found={found}
          styles={styles}
        />
      ))}
    </View>
  );
}

interface RowsProps {
  // The lines the block is of.
  lines: readonly NumberedLine[];
  // Which of the lines inline, or of their rows side by side, it has: from `start`, up to `end`.
  start: number;
  end: number;
  idOf: IdOf;
  selected: Selected;
  changes: ChangedText;
  found: FoundText;
  styles: Styles;
}

function InlineRows({
  lines,
  start,
  end,
  idOf,
  selected,
  changes,
  found,
  styles,
}: RowsProps): ReactElement[] {
  return lines
    .slice(start, end)
    .map((line, at) => (
      <DiffLine
        key={lineKey(line)}
        id={idOf({ index: start + at, line }, true)}
        line={line}
        selected={selected(start + at)}
        side={undefined}
        selectable
        changes={changes(start + at)}
        found={found(start + at)}
        styles={styles}
      />
    ));
}

interface SideBySideRowsProps extends RowsProps {
  sideBySide: SideBySide;
}

function SideBySideRows({
  sideBySide: { rows, focus },
  start,
  end,
  idOf,
  selected,
  changes,
  found,
  styles,
}: SideBySideRowsProps): ReactElement[] {
  return rows
    .slice(start, end)
    .map((row) => (
      <SideBySideRow
        key={rowKey(row)}
        row={row}
        idOf={idOf}
        selected={selected}
        focus={focus}
        changes={changes}
        found={found}
        styles={styles}
      />
    ));
}

interface BlockRowsProps extends RowsProps {
  // Undefined inline.
  sideBySide: SideBySide | undefined;
}

function BlockRows({ sideBySide, ...rows }: BlockRowsProps): ReactElement {
  return sideBySide === undefined ? (
    <InlineRows {...rows} />
  ) : (
    <SideBySideRows sideBySide={sideBySide} {...rows} />
  );
}

interface BlockProps extends BlockRowsProps {
  // Whether it renders its lines, rather than only the room they take, until it does.
  rendered: boolean;
}

// Some of the lines, one under the other, or side by side. The browser lays them out and paints
// them, and finds what's under the pointer among them, only while they're on screen, in the room
// they take until then, so that scrolling a view of thousands of lines, or moving the pointer over
// it, takes as long as the lines on screen.
function BlockOfLines({ sideBySide, rendered, ...rows }: BlockProps): ReactElement {
  const fonts = useContext(FontSizesContext);
  const height = blockTall(rows.lines, sideBySide?.rows, rows) * fonts.codeLine;

  return rendered ? (
    <View style={{ contentVisibility: "auto", containIntrinsicSize: `auto ${String(height)}px` }}>
      <BlockRows sideBySide={sideBySide} {...rows} />
    </View>
  ) : (
    <View style={{ height }} />
  );
}

// Rendered again only once what it's rendered with changes, as once the view renders the lines
// whose room it took, and not as other blocks are.
export const Block = memo(BlockOfLines);
