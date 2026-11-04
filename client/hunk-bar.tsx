import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { memo, useMemo, useState, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";

import type { diffRpc } from "../shared/diff";
import { ActionButtons } from "./action-buttons";
import { hunkActions, hunkLines, lineActions } from "./actions";
import type { Controls } from "./actions";
import type { OpenFile } from "./groups";
import { IconButton } from "./icon-button";
import { entireFileIcon, onlyHunksIcon } from "./icons";
import type { PointedHunk } from "./pointed";
import { hunkRevealed } from "./reveal";
import { rangeKey, rangeLines } from "./selection";
import type { LineRange } from "./selection";

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
        // Opaque, since it stays over the hunk's lines as they scroll under it.
        bar: {
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
  theme,
}: LineButtonsProps): ReactElement | null {
  return selection?.hunk === index ? (
    <ActionButtons
      actions={lineActions[file.group]}
      bar={`${version}:lines ${index}:${rangeKey(selection)}`}
      target={{ file, version, lines: rangeLines(selection, hunk.lines) }}
      controls={controls}
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
  theme: PluginTheme;
}

// On its left, the toggle between the entire file and only its hunks, and on its right, the hunk's
// actions, both hidden until the hunk is revealed, and those on its selected lines while it has
// any.
function BarOfHunk({
  hunk,
  index,
  version,
  file,
  selection,
  pointed,
  controls,
  entire,
  onToggleEntire,
  onHeight,
  onRun,
  theme,
}: HunkBarProps): ReactElement {
  const styles = useStyles(theme);
  const [focused, setFocused] = useState(false);
  const revealed = hunkRevealed(index, usePointedAt(pointed, index), focused, selection?.hunk);

  return (
    <View
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
          theme={theme}
        />
        <ActionButtons
          actions={hunkActions[file.group]}
          bar={`${version}:hunk ${index}`}
          target={{ file, version, lines: hunkLines(hunk.lines, index) }}
          controls={controls}
          onRun={() => {
            onRun(index);
          }}
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
