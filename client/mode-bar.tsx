import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { useContext, useId, useLayoutEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { diffRpc } from "../shared/diff";
import { ActionButtons } from "./action-buttons";
import { fileActions, fileBarOf, modeActions } from "./actions";
import type { Controls } from "./actions";
import { barCommand } from "./bar-commands";
import { fileBar, KeyboardFocusContext, modeBar } from "./focus";
import { FontSizesContext } from "./fonts";
import type { OpenFile } from "./groups";
import { useBarFocus, useCommands } from "./keyboard";
import type { Bar } from "./shortcuts";
import { useInsetFocusRing, useLatest } from "./web";

type Mode = NonNullable<RpcOutput<typeof diffRpc>["mode"]>;

// Shaded as a hunk's bar.
function useStyles(theme: PluginTheme) {
  const fonts = useContext(FontSizesContext);

  return useMemo(
    () =>
      StyleSheet.create({
        bar: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          paddingHorizontal: 12,
          // With its borders, as tall as a file's bar.
          paddingVertical: 5,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
        },
        text: { fontSize: fonts.small, color: theme.colors.foreground },
      }),
    [theme, fonts],
  );
}

interface ModeBarProps {
  mode: Mode;
  version: string;
  file: OpenFile;
  // Its file's index in the view.
  fileIndex: number;
  // Scrolls the view to show the diff of the file at the index from its start.
  onShow: (fileIndex: number) => void;
  // Called with its file's index just before one of the bar's shortcuts runs an action on the file.
  onFileRun: ((fileIndex: number) => void) | undefined;
  controls: Controls;
  theme: PluginTheme;
}

// The file's mode change, as Magit shows it, with the actions on it alone. Keys move focus to the
// bar itself, and in it move focus on through the view's bars, or back to its file's row, and run
// its actions or its file's. Once an action runs with focus in it, focus moves on to the file's
// first hunk, or the first hunk of the file that takes its place.
export function ModeBar({
  mode,
  version,
  file,
  fileIndex,
  onShow,
  onFileRun,
  controls,
  theme,
}: ModeBarProps): ReactElement {
  const styles = useStyles(theme);
  const id = useId();
  const bar = useRef<View>(null);
  const focus = useContext(KeyboardFocusContext);
  const { focused, handlers } = useBarFocus();
  const show = useLatest(onShow);
  const { group, path } = file;

  function holdFocus(): void {
    if (focused) {
      focus.hold([fileIndex, fileBar]);
    }
  }

  const bars: Record<"part" | "file", Bar> = {
    part: {
      actions: modeActions[group],
      bar: `${version}:mode`,
      target: { file, version, mode: true },
      onRun: holdFocus,
    },
    file: {
      actions: fileActions[group],
      bar: fileBarOf(version),
      target: { file, version },
      onRun: () => {
        holdFocus();
        onFileRun?.(fileIndex);
      },
    },
  };

  useLayoutEffect(
    () =>
      focus.addStop({
        file: { group, path },
        at: [fileIndex, modeBar],
        focus: () => {
          bar.current?.focus();
        },
        show: () => {
          show.current(fileIndex);
        },
      }),
    [focus, group, path, fileIndex, show],
  );

  useInsetFocusRing(id);
  useCommands(id, "bar", (command, own) =>
    barCommand(command, own, { file, at: [fileIndex, modeBar], bars }, focus, controls),
  );

  return (
    <View
      ref={bar}
      nativeID={id}
      tabIndex={-1}
      role="group"
      accessibilityLabel={`Mode change of ${path}`}
      style={styles.bar}
      {...handlers}
    >
      <Text style={styles.text}>
        File mode {mode.old} → {mode.new}
      </Text>
      <ActionButtons
        {...bars.part}
        level="part"
        place="bar"
        controls={controls}
        color={theme.colors.foreground}
        theme={theme}
      />
    </View>
  );
}
