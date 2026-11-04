import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import type { ReactElement, RefObject } from "react";
import {
  memo,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { StyleSheet, View } from "react-native";

import type { diffRpc } from "../shared/diff";
import { ActionButtons } from "./action-buttons";
import { hunkActions, hunkLines, lineActions } from "./actions";
import type { Controls } from "./actions";
import { hunkMove } from "./arrows";
import { KeyboardFocusContext } from "./focus";
import type { OpenFile } from "./groups";
import { IconButton } from "./icon-button";
import { entireFileIcon, onlyHunksIcon } from "./icons";
import type { PointedHunk } from "./pointed";
import { hunkRevealed } from "./reveal";
import { rangeKey, rangeLines } from "./selection";
import type { LineRange } from "./selection";
import { useKeys, useStuckAt } from "./web";

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

// What the toggle shows the entire file with, and only the hunks.
const toggles = {
  entire: { label: "Show entire file", icon: entireFileIcon },
  hunks: { label: "Show only modified hunks", icon: onlyHunksIcon },
};

interface EntireFileToggleProps {
  // Whether the view shows the entire file, rather than only its hunks.
  entire: boolean;
  onPress: () => void;
  hidden: boolean;
  theme: PluginTheme;
}

// Sublime Merge's icon for what it shows the view instead.
function EntireFileToggle({ entire, onPress, hidden, theme }: EntireFileToggleProps): ReactElement {
  const toggle = entire ? toggles.hunks : toggles.entire;

  return (
    <IconButton
      label={toggle.label}
      icon={toggle.icon}
      onPress={onPress}
      hidden={hidden}
      theme={theme}
    />
  );
}

interface LineButtonsProps {
  hunk: Hunk;
  index: number;
  version: string;
  file: OpenFile;
  selection: LineRange | undefined;
  controls: Controls;
  // Called just before one of the actions runs.
  onRun: () => void;
  theme: PluginTheme;
}

// The actions on the hunk's selected lines, while it has any.
function LineButtons({
  hunk,
  index,
  version,
  file,
  selection,
  controls,
  onRun,
  theme,
}: LineButtonsProps): ReactElement | null {
  return selection?.hunk === index ? (
    <ActionButtons
      actions={lineActions[file.group]}
      bar={`${version}:lines ${index}:${rangeKey(selection)}`}
      target={{ file, version, lines: rangeLines(selection, hunk.lines) }}
      controls={controls}
      onRun={onRun}
      color={theme.colors.foreground}
      theme={theme}
    />
  ) : null;
}

interface HunkBarProps {
  hunk: Hunk;
  index: number;
  version: string;
  file: OpenFile;
  // Its file's index in the view.
  fileIndex: number;
  selection: LineRange | undefined;
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
  // Called with the hunk's index to scroll the view to show the hunk from its start.
  onShow: (hunk: number) => void;
  // How far below the top of the view the bar stays while the hunk's lines scroll under it, while
  // they scroll with the view's other diffs, whose view keeps only the files' bars at its top.
  stuckBelow: number | undefined;
  theme: PluginTheme;
}

// Lets the panel's keyboard focus move to the hunk, onto the button, and show it with `onShow`.
function useHunkFocus(
  file: OpenFile,
  fileIndex: number,
  index: number,
  button: RefObject<View | null>,
  onShow: (hunk: number) => void,
): void {
  const focus = useContext(KeyboardFocusContext);
  const { group, path } = file;

  useLayoutEffect(
    () =>
      focus.addHunk({
        file: { group, path },
        place: [fileIndex, index],
        focus: () => {
          button.current?.focus();
        },
        show: () => {
          onShow(index);
        },
      }),
    [focus, group, path, fileIndex, index, button, onShow],
  );
}

// On its left, the toggle between the entire file and only its hunks, and on its right, the hunk's
// actions, both hidden until the hunk is revealed, and those on its selected lines while it has
// any. With focus in it, ↓ and ↑ move focus to the next hunk or the one before, and ← to its file's
// row. Once an action on the hunk or its lines runs with focus in it, focus moves on with the view.
function BarOfHunk({
  hunk,
  index,
  version,
  file,
  fileIndex,
  selection,
  pointed,
  controls,
  entire,
  onToggleEntire,
  onHeight,
  onRun,
  onShow,
  stuckBelow,
  theme,
}: HunkBarProps): ReactElement {
  const styles = useStyles(theme);
  const [focused, setFocused] = useState(false);
  const revealed = hunkRevealed(index, usePointedAt(pointed, index), focused, selection?.hunk);
  const id = useId();
  const button = useRef<View>(null);
  const focus = useContext(KeyboardFocusContext);

  useStuckAt(id, stuckBelow);
  useHunkFocus(file, fileIndex, index, button, onShow);

  useKeys(id, hunkMove, (move) => {
    if (move === "row") {
      focus.toRow(file);
    } else {
      focus.toHunkBy([fileIndex, index], move);
    }
  });

  // Called just before an action on the hunk or its lines runs.
  function holdFocus(): void {
    if (focused) {
      focus.hold([fileIndex, index]);
    }
  }

  return (
    <View
      nativeID={id}
      style={styles.bar}
      onLayout={
        index === 0
          ? (event) => {
              onHeight(event.nativeEvent.layout.height);
            }
          : undefined
      }
      onFocus={() => {
        setFocused(true);
      }}
      onBlur={() => {
        setFocused(false);
      }}
      {...pointed.pointer(index)}
    >
      <EntireFileToggle
        entire={entire}
        onPress={() => {
          onToggleEntire(index);
        }}
        hidden={!revealed}
        theme={theme}
      />
      <View style={styles.buttons}>
        <LineButtons
          hunk={hunk}
          index={index}
          version={version}
          file={file}
          selection={selection}
          controls={controls}
          onRun={holdFocus}
          theme={theme}
        />
        <ActionButtons
          actions={hunkActions[file.group]}
          bar={`${version}:hunk ${index}`}
          target={{ file, version, lines: hunkLines(hunk.lines, index) }}
          controls={controls}
          onRun={() => {
            holdFocus();
            onRun(index);
          }}
          hidden={!revealed}
          buttonRef={button}
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
