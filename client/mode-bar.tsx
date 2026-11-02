import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { diffRpc } from "../shared/diff";
import { ActionButtons } from "./action-buttons";
import { modeActions } from "./actions";
import type { Controls } from "./actions";
import type { OpenFile } from "./groups";

type Mode = NonNullable<RpcOutput<typeof diffRpc>["mode"]>;

// Shaded as a hunk's bar.
function useStyles(theme: PluginTheme) {
  return useMemo(
    () =>
      StyleSheet.create({
        bar: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          paddingHorizontal: 12,
          paddingVertical: 3,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
        },
        text: { fontSize: 12, color: theme.colors.foreground },
      }),
    [theme],
  );
}

interface ModeBarProps {
  mode: Mode;
  version: string;
  file: OpenFile;
  controls: Controls;
  theme: PluginTheme;
}

// The file's mode change, as Magit shows it, with the actions on it alone.
export function ModeBar({ mode, version, file, controls, theme }: ModeBarProps): ReactElement {
  const styles = useStyles(theme);

  return (
    <View style={styles.bar}>
      <Text style={styles.text}>
        File mode {mode.old} → {mode.new}
      </Text>
      <ActionButtons
        actions={modeActions[file.group]}
        bar={`${version}:mode`}
        target={{ file, version, mode: true }}
        controls={controls}
        color={theme.colors.foreground}
        theme={theme}
      />
    </View>
  );
}
