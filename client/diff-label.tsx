import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { useContext, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { diffRpc } from "../shared/diff";
import { FontSizesContext } from "./fonts";
import { Hoverable, TintLayer } from "./hoverable";
import { chordOf } from "./keymap";
import { ShortcutTip } from "./shortcut-tip";
import { shortcutText } from "./shortcuts";
import { onMac } from "./web";

type Diff = RpcOutput<typeof diffRpc>;

function useStyles(theme: PluginTheme) {
  const fonts = useContext(FontSizesContext);

  return useMemo(
    () =>
      StyleSheet.create({
        labelRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
        label: { fontSize: fonts.text, color: theme.colors.foregroundMuted },
        // Rounded as its box is, for its focus ring.
        expand: { borderRadius: 4 },
        expandBox: {
          paddingHorizontal: 9,
          paddingVertical: 3,
          borderRadius: 4,
          overflow: "hidden",
        },
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

// What's shown instead of a diff without lines, with a button that shows a collapsed one's, as E in
// the file's bar does, which shows under it once the pointer rests on it.
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
              <View style={styles.expandBox}>
                <TintLayer
                  color={theme.colors.foreground}
                  hovered={hovered}
                  pressed={pressed}
                  filled
                />
                <Text selectable={false} style={styles.expandText}>
                  Show diff
                </Text>
              </View>
              <ShortcutTip
                shortcut={shortcutText(chordOf("bar", "more"), onMac())}
                resting={hovered && !pressed}
                theme={theme}
              />
            </>
          )}
        </Hoverable>
      )}
    </View>
  );
}
