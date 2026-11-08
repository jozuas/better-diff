import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import type { ReactElement, RefObject } from "react";
import {
  memo,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { StyleSheet, View } from "react-native";

import type { diffRpc } from "../shared/diff";
import { ActionButtons } from "./action-buttons";
import type { Controls } from "./actions";
import { barCommand, fileBarActions, hunkBarOf, lineBarOf, lineCommand } from "./bar-commands";
import { KeyboardFocusContext } from "./focus";
import type { HunkEnd } from "./focus";
import type { OpenFile } from "./groups";
import { EntireFileToggle, LineButtons } from "./hunk-buttons";
import { handled, heard } from "./key-events";
import { useBarFocus, useKeys } from "./keyboard";
import { rangeOf, selectedCursor } from "./line-cursor";
import type { Cursor } from "./line-cursor";
import { enteredAt, selectCursor } from "./line-keys";
import type { LinePage } from "./line-keys";
import type { PointedHunk } from "./pointed";
import { hunkKeyed, hunkRevealed } from "./reveal";
import { fileId, lineId } from "./selection";
import type { LineRange } from "./selection";
import { whileShown } from "./shown";
import type { Focus } from "./side-by-side";
import { clearSelection, nearestLevel, selectedNow, selectLines } from "./text-selection";
import { afterRender, onMac, useInsetFocusRing, useLatest, useStuckAt } from "./web";

type Hunk = RpcOutput<typeof diffRpc>["hunks"][number];

// The hunk the pointer is over, if it's the one at the index. Only the pointer coming over the
// hunk or leaving it renders the caller again.
function usePointedAt(pointed: PointedHunk, hunk: number): number | undefined {
  return useSyncExternalStore(pointed.subscribe, () =>
    pointed.hunk() === hunk ? hunk : undefined,
  );
}

function useStyles(theme: PluginTheme) {
  return useMemo(
    () =>
      StyleSheet.create({
        // Opaque, and over the hunk's lines, since it stays over them as they scroll under it.
        bar: {
          zIndex: 1,
          flexDirection: "row",
          paddingHorizontal: 12,
          // With its borders, as tall as a file's bar.
          paddingVertical: 5,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
        },
        buttons: { flexDirection: "row", gap: 6, marginLeft: "auto" },
      }),
    [theme],
  );
}

interface HunkBarProps {
  hunk: Hunk;
  index: number;
  version: string;
  // The version of the file's diff its file's bar shows, which the file's actions act on.
  fileVersion: string;
  file: OpenFile;
  // Its file's index in the view, and the view's id.
  fileIndex: number;
  view: string;
  selection: LineRange | undefined;
  // Which side has focus, side by side.
  sides: Focus | undefined;
  // Which of the diff's hunks the pointer is over.
  pointed: PointedHunk;
  controls: Controls;
  // Whether the view shows the entire file, rather than only its hunks.
  entire: boolean;
  // Called with the hunk's index.
  onToggleEntire: (hunk: number) => void;
  // Hears the height of the diff's first hunk's bar, which every hunk's bar has. Only that one is
  // measured: measuring each bar would read the page's layout once for each of a diff's hunks.
  onHeight: (height: number) => void;
  // Called with the hunk's index just before an action on the hunk runs.
  onRun: (hunk: number) => void;
  // Called with its file's index just before one of the bar's shortcuts runs an action on the file.
  onFileRun: ((fileIndex: number) => void) | undefined;
  // Called with the hunk's index to scroll the view to show the hunk from its start.
  onShow: (hunk: number) => void;
  // Scrolls the view to show the line with the id.
  onReveal: (line: string) => void;
  // How far below the top of the view the bar stays while the hunk's lines scroll under it, while
  // they scroll with the view's other diffs, whose view keeps only the files' bars at its top.
  stuckBelow: number | undefined;
  theme: PluginTheme;
}

// Lets the panel's keyboard focus move to the bar, show its hunk with `onShow`, and select its
// lines with `enter`.
function useHunkFocus(
  { file, fileIndex, index, onShow }: Pick<HunkBarProps, "file" | "fileIndex" | "index" | "onShow">,
  bar: RefObject<View | null>,
  enter: (end: HunkEnd) => void,
): void {
  const focus = useContext(KeyboardFocusContext);
  const latest = useLatest(enter);
  const { group, path } = file;

  useLayoutEffect(
    () =>
      focus.addStop({
        file: { group, path },
        at: [fileIndex, index],
        focus: () => {
          bar.current?.focus();
        },
        show: () => {
          onShow(index);
        },
        enter: (end) => {
          latest.current(end);
        },
      }),
    [focus, group, path, fileIndex, index, bar, onShow, latest],
  );
}

// Selects the hunk's lines from the keyboard: on their side, which then has focus, side by side,
// showing the line the selection reaches. The lines selected are the page's text selection's, which
// keys move or the pointer does.
function useLineSelection({
  hunk,
  index,
  fileIndex,
  view,
  sides,
  onReveal,
}: Pick<HunkBarProps, "hunk" | "index" | "fileIndex" | "view" | "sides" | "onReveal">) {
  const kinds = useMemo(() => hunk.lines.map(({ kind }) => kind), [hunk.lines]);
  const container = fileId(view, fileIndex);

  const page: LinePage = {
    select: (anchor, head) => {
      selectLines(container, index, anchor, head);
    },
    reveal: (line) => {
      onReveal(lineId(container, index, line));
    },
    afterRender,
  };

  function select(next: Cursor): void {
    selectCursor(next, sides, page);
  }

  return {
    kinds,
    select,
    // The lines selected in the hunk now, if any.
    now: () => selectedCursor(selectedNow(view), fileIndex, index, sides?.side),
    enter: (end: HunkEnd | "changed") => {
      const next = enteredAt(end, kinds, sides);

      if (next !== undefined) {
        select(next);
      }
    },
    leave: clearSelection,
  };
}

// On its left, the toggle between the entire file and only its hunks, and on its right, the hunk's
// actions, both hidden until the hunk is revealed, and those on its selected lines while it has
// any. Keys move focus to the bar itself, and in it move focus on through the view's bars, or back
// to its file's row, run the hunk's actions or its file's, and select its lines and move the
// selection on, while the actions they run act on the lines. Once an action on the hunk or its
// lines runs with focus in it, focus moves on with the view, and once one on its file does, to the
// first hunk of the file that takes the file's place.
function BarOfHunk(props: HunkBarProps): ReactElement {
  const {
    hunk,
    index,
    version,
    fileVersion,
    file,
    fileIndex,
    view,
    selection,
    pointed,
    controls,
    entire,
    onToggleEntire,
    onHeight,
    onRun,
    onFileRun,
    stuckBelow,
    theme,
  } = props;

  const styles = useStyles(theme);
  const { focused, onBar, handlers } = useBarFocus();
  const revealed = hunkRevealed(index, usePointedAt(pointed, index), focused, selection?.hunk);
  const id = useId();
  const bar = useRef<View>(null);
  const focus = useContext(KeyboardFocusContext);
  const lines = useLineSelection(props);

  useStuckAt(id, stuckBelow);
  useInsetFocusRing(id);
  useHunkFocus(props, bar, lines.enter);

  // Called just before an action on the hunk or its lines runs.
  function holdFocus(): void {
    if (focused) {
      focus.hold([fileIndex, index]);
    }
  }

  function toggleEntire(): void {
    onToggleEntire(index);
  }

  const hunkBar = hunkBarOf(file, { version, index, hunk }, () => {
    holdFocus();
    onRun(index);
  });

  const lineBar = lineBarOf(file, { version, index, hunk }, selection, holdFocus);

  // The file's bar's buttons, which their shortcuts press from here too. Focus then moves to the
  // first hunk in the place of the file's first.
  const fileBar = fileBarActions(file, { version: fileVersion }, () => {
    focus.hold([fileIndex, 0]);
    onFileRun?.(fileIndex);
  });

  // Keys act on the hunk's selected lines while it has any, and else on the hunk.
  useKeys(id, (event, own) => {
    const cursor = lines.now();

    if (cursor === undefined) {
      return handled(heard("bar", event, onMac()), (command) =>
        barCommand(
          command,
          own,
          {
            file,
            at: [fileIndex, index],
            bars: { part: hunkBar, file: fileBar },
            onInto: () => {
              lines.enter("changed");
            },
            onMore: toggleEntire,
          },
          focus,
          controls,
        ),
      );
    }

    const keyedBar = lineBarOf(
      file,
      { version, index, hunk },
      rangeOf(cursor, fileIndex, index),
      holdFocus,
    );

    return handled(heard("lines", event, onMac()), (command) =>
      lineCommand(
        command,
        own,
        {
          kinds: lines.kinds,
          cursor,
          bars: { part: keyedBar, file: fileBar },
          select: lines.select,
          onPast: (step) => {
            focus.toLinesBy([fileIndex, index], step);
          },
          level: (shown) => nearestLevel(fileId(view, fileIndex), index, cursor.head, shown),
          onLeave: lines.leave,
          onMore: toggleEntire,
        },
        controls,
      ),
    );
  });

  return (
    <View
      ref={bar}
      nativeID={id}
      tabIndex={-1}
      role="group"
      accessibilityLabel={`Hunk ${index + 1} of ${file.path}`}
      style={styles.bar}
      onLayout={
        index === 0
          ? whileShown(({ height }) => {
              onHeight(height);
            })
          : undefined
      }
      {...handlers}
      {...pointed.pointer(index)}
    >
      <EntireFileToggle entire={entire} onPress={toggleEntire} hidden={!revealed} theme={theme} />
      <View style={styles.buttons}>
        <LineButtons bar={lineBar} keyed={onBar} controls={controls} theme={theme} />
        <ActionButtons
          {...hunkBar}
          level="part"
          place="bar"
          keyed={hunkKeyed(onBar, lineBar !== undefined)}
          controls={controls}
          hidden={!revealed}
          color={theme.colors.foreground}
          theme={theme}
        />
      </View>
    </View>
  );
}

// Rendered again only once what it's rendered with changes, as the text selection reaching into its
// hunk or leaving it does, or the pointer coming over the hunk or leaving it, and not as they change
// in other hunks.
export const HunkBar = memo(BarOfHunk);
