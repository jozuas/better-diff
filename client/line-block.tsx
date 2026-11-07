import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { memo, useContext, useSyncExternalStore } from "react";
import { View } from "react-native";

import type { TextRange } from "./changed-text";
import { CommentThread } from "./comment-thread";
import { commentedBy, commentsOn, pointedIn, subscribeToPointed } from "./commenting";
import type { Commented, Commenting, LineComments } from "./commenting";
import type { Thread } from "./comments";
import { DiffLine } from "./diff-line";
import type { Styles } from "./diff-styles";
import type { FoundRange } from "./find";
import { FontSizesContext, textPadding } from "./fonts";
import { lineKey } from "./lines";
import type { IndexedLine, NumberedLine } from "./lines";
import type { LineAt } from "./pointed";
import { blockTall } from "./rendering";
import { ReviewContext } from "./review-context";
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
  comments: LineComments;
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
  comments,
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
          pointer={comments.pointer}
          onComment={comments.onComment}
          styles={styles}
        />
      )}
    </View>
  );
}

// Each side's comments under a row, under its side.
interface ThreadsRowProps {
  threads: Record<Side, Thread | undefined>;
  theme: PluginTheme;
  styles: Styles;
}

function ThreadsRow({ threads, theme, styles }: ThreadsRowProps): ReactElement | null {
  const fonts = useContext(FontSizesContext);

  if (threads.old === undefined && threads.new === undefined) {
    return null;
  }

  return (
    <View style={styles.line}>
      {sides.map((side) => (
        <View key={side} style={[styles.half, styles[side]]}>
          <CommentThread thread={threads[side]} indent={fonts.number + textPadding} theme={theme} />
        </View>
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
  theme: PluginTheme;
}

interface CommentedRowsProps extends RowsProps {
  commented: Commented | undefined;
}

// Each line, and under one commented on, its comments.
function InlineRows({
  lines,
  start,
  end,
  idOf,
  selected,
  changes,
  found,
  commented,
  styles,
  theme,
}: CommentedRowsProps): ReactElement[] {
  const fonts = useContext(FontSizesContext);

  return lines.slice(start, end).flatMap((line, at) => {
    const index = start + at;
    const key = lineKey(line);
    const { pointer, onComment, thread } = commentsOn(commented, { index, line });

    return [
      <DiffLine
        key={key}
        id={idOf({ index, line }, true)}
        line={line}
        selected={selected(index)}
        side={undefined}
        selectable
        changes={changes(index)}
        found={found(index)}
        pointer={pointer}
        onComment={onComment}
        styles={styles}
      />,
      <CommentThread
        key={`${key} comments`}
        thread={thread}
        indent={2 * fonts.number + textPadding}
        theme={theme}
      />,
    ];
  });
}

interface SideBySideRowsProps extends CommentedRowsProps {
  sideBySide: SideBySide;
}

// Each side's line level with the other's, and under a row with a side commented on, that side's
// comments. Only the text of the side with focus can be selected, and has the ids a selection finds
// lines by, so a selection has only that side's.
function SideBySideRows({
  sideBySide: { rows, focus },
  start,
  end,
  idOf,
  selected,
  changes,
  found,
  commented,
  styles,
  theme,
}: SideBySideRowsProps): ReactElement[] {
  return rows.slice(start, end).flatMap((row) => {
    const key = rowKey(row);

    const comments = {
      old: commentsOn(commented, row.old, "old"),
      new: commentsOn(commented, row.new, "new"),
    };

    const threads = { old: comments.old.thread, new: comments.new.thread };

    return [
      <View key={key} style={styles.line}>
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
            comments={comments[side]}
            styles={styles}
          />
        ))}
      </View>,
      <ThreadsRow key={`${key} comments`} threads={threads} theme={theme} styles={styles} />,
    ];
  });
}

interface BlockRowsProps extends RowsProps {
  // Undefined inline.
  sideBySide: SideBySide | undefined;
}

interface BlockProps extends BlockRowsProps {
  // Whether it renders its lines, rather than only the room they take, until it does.
  rendered: boolean;
  // Undefined for lines that can't be commented on.
  commenting: Commenting | undefined;
}

// The line the pointer is over, if it's one the block shows: only the pointer moving onto one of
// the block's lines, or from one, renders the block again.
function usePointedIn(
  { sideBySide, start, end }: BlockRowsProps,
  commenting: Commenting | undefined,
): LineAt | undefined {
  return useSyncExternalStore(subscribeToPointed(commenting), () =>
    pointedIn(commenting, sideBySide?.rows, start, end),
  );
}

type CommentedBlockRowsProps = BlockRowsProps & CommentedRowsProps;

function BlockRows({ sideBySide, ...rows }: CommentedBlockRowsProps): ReactElement {
  return sideBySide === undefined ? (
    <InlineRows {...rows} />
  ) : (
    <SideBySideRows sideBySide={sideBySide} {...rows} />
  );
}

// Some of the lines, one under the other, or side by side. The browser lays them out and paints
// them, and finds what's under the pointer among them, only while they're on screen, in the room
// they take until then, so that scrolling a view of thousands of lines, or moving the pointer over
// it, takes as long as the lines on screen.
function BlockOfLines({ rendered, commenting, ...rows }: BlockProps): ReactElement {
  const fonts = useContext(FontSizesContext);
  const review = useContext(ReviewContext);
  const pointed = usePointedIn(rows, commenting);
  const height = blockTall(rows.lines, rows.sideBySide?.rows, rows) * fonts.codeLine;

  if (!rendered) {
    return <View style={{ height }} />;
  }

  return (
    <View style={{ contentVisibility: "auto", containIntrinsicSize: `auto ${String(height)}px` }}>
      <BlockRows {...rows} commented={commentedBy(review, commenting, pointed)} />
    </View>
  );
}

// Rendered again only once what it's rendered with changes, as once the view renders the lines
// whose room it took, or the pointer moves onto one of its lines or from one, or the comments
// change, and not as other blocks are.
export const Block = memo(BlockOfLines);
