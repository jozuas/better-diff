import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import type { ViewProps } from "react-native";
import { StyleSheet, View } from "react-native";

import type { diffRpc } from "../shared/diff";
import { ActionButtons } from "./action-buttons";
import { hunkActions, hunkLines, lineActions } from "./actions";
import type { Controls } from "./actions";
import type { OpenFile } from "./groups";
import { IconButton } from "./icon-button";
import { entireFileIcon, onlyHunksIcon } from "./icons";
import { hunkRevealed } from "./reveal";
import { rangeKey, rangeLines } from "./selection";
import type { LineRange } from "./selection";

type Hunk = RpcOutput<typeof diffRpc>["hunks"][number];

// What hears the pointer coming over a hunk's bar or lines and leaving them.
export type PointerHandlers = Pick<ViewProps, "onPointerEnter" | "onPointerLeave">;

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
  // The hunk the pointer is over, if any.
  pointed: number | undefined;
  pointer: PointerHandlers;
  controls: Controls;
  // Whether the view shows the entire file, rather than only its hunks.
  entire: boolean;
  onToggleEntire: () => void;
  // Hears the bar's height.
  onHeight: (height: number) => void;
  // Called just before an action on the hunk runs.
  onRun: () => void;
  theme: PluginTheme;
}

// On its left, the toggle between the entire file and only its hunks, and on its right, the hunk's
// actions, both hidden until the hunk is revealed, and those on its selected lines while it has
// any.
export function HunkBar({
  hunk,
  index,
  version,
  file,
  selection,
  pointed,
  pointer,
  controls,
  entire,
  onToggleEntire,
  onHeight,
  onRun,
  theme,
}: HunkBarProps): ReactElement {
  const styles = useStyles(theme);
  const [focused, setFocused] = useState(false);
  const revealed = hunkRevealed(index, pointed, focused, selection?.hunk);

  return (
    <View
      style={styles.bar}
      onLayout={(event) => {
        onHeight(event.nativeEvent.layout.height);
      }}
      onFocus={() => {
        setFocused(true);
      }}
      onBlur={() => {
        setFocused(false);
      }}
      {...pointer}
    >
      <EntireFileToggle entire={entire} onPress={onToggleEntire} hidden={!revealed} theme={theme} />
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
          onRun={onRun}
          hidden={!revealed}
          color={theme.colors.foreground}
          theme={theme}
        />
      </View>
    </View>
  );
}
