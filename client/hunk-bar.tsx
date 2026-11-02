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
import { hunkRevealed } from "./reveal";
import { rangeLines } from "./selection";
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
          paddingVertical: 3,
          backgroundColor: theme.colors.surface0,
        },
        tint: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: theme.colors.accent,
          opacity: 0.25,
        },
        buttons: { flexDirection: "row", gap: 6, marginLeft: "auto" },
      }),
    [theme],
  );
}

interface LineButtonsProps {
  index: number;
  version: string;
  file: OpenFile;
  selection: LineRange | undefined;
  controls: Controls;
  theme: PluginTheme;
}

// The actions on the hunk's selected lines, while it has any.
function LineButtons({
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
      bar={`${version}:lines ${index}:${selection.first}-${selection.last}`}
      target={{ file, version, lines: rangeLines(selection) }}
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
  // Hears the bar's height.
  onHeight: (height: number) => void;
  // Called just before an action on the hunk runs.
  onRun: () => void;
  theme: PluginTheme;
}

// A hunk's actions, hidden until the hunk is revealed, and those on its selected lines while it has
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
  onHeight,
  onRun,
  theme,
}: HunkBarProps): ReactElement {
  const styles = useStyles(theme);
  const [focused, setFocused] = useState(false);

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
      <View style={styles.tint} />
      <View style={styles.buttons}>
        <LineButtons
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
          hidden={!hunkRevealed(index, pointed, focused, selection?.hunk)}
          color={theme.colors.foreground}
          theme={theme}
        />
      </View>
    </View>
  );
}
