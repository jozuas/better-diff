import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { useContext, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { diffRpc } from "../shared/diff";
import { FontSizesContext } from "./fonts";
import { Hoverable, TintLayer } from "./hoverable";

type Diff = RpcOutput<typeof diffRpc>;

function useStyles(theme: PluginTheme) {
  const fonts = useContext(FontSizesContext);

  return useMemo(
    () =>
      StyleSheet.create({
        labelRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
        label: { fontSize: fonts.text, color: theme.colors.foregroundMuted },
        expand: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 4, overflow: "hidden" },
        expandText: { fontSize: fonts.small, color: theme.colors.foreground },
      }),
    [theme, fonts],
  );
}

interface LabelRowProps {
  label: string;
  diff: Diff;
  onExpand: () => void;
  theme: PluginTheme;
}

// What's shown instead of a diff without lines, with a button that shows a collapsed one's.
export function LabelRow({ label, diff, onExpand, theme }: LabelRowProps): ReactElement {
  const styles = useStyles(theme);

  return (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{label}</Text>
      {diff.collapsed === undefined ? null : (
        <Hoverable
          accessibilityRole="button"
          accessibilityLabel="Show diff"
          style={styles.expand}
          onPress={onExpand}
        >
          {({ hovered, pressed }) => (
            <>
              <TintLayer
                color={theme.colors.foreground}
                hovered={hovered}
                pressed={pressed}
                filled
              />
              <Text selectable={false} style={styles.expandText}>
                Show diff
              </Text>
            </>
          )}
        </Hoverable>
      )}
    </View>
  );
}
