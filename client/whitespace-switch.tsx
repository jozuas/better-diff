import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { useContext, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FontSizesContext } from "./fonts";
import { Hoverable, TintLayer } from "./hoverable";

// Whether the panel's diffs hide changes only to whitespace, which the panel doesn't keep once
// Paseo reloads, and what hides or shows them.
export interface Whitespace {
  hidden: boolean;
  onToggle: () => void;
}

interface WhitespaceSwitchProps {
  whitespace: Whitespace;
  theme: PluginTheme;
}

// Hides or shows whitespace changes in all of the panel's diffs. It's in the accent colour while
// they're hidden.
export function WhitespaceSwitch({ whitespace, theme }: WhitespaceSwitchProps): ReactElement {
  const fonts = useContext(FontSizesContext);
  const color = whitespace.hidden ? theme.colors.accent : theme.colors.foreground;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        // Rounded as its box is, for its focus ring.
        button: { borderRadius: 4 },
        box: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 4, overflow: "hidden" },
        text: { fontSize: fonts.small },
      }),
    [fonts],
  );

  return (
    <Hoverable
      accessibilityRole="switch"
      accessibilityLabel="Hide whitespace"
      aria-checked={whitespace.hidden}
      style={styles.button}
      onPress={whitespace.onToggle}
    >
      {({ hovered, pressed }) => (
        <View style={styles.box}>
          <TintLayer color={color} hovered={hovered} pressed={pressed} filled />
          <Text selectable={false} style={[styles.text, { color }]}>
            Hide whitespace
          </Text>
        </View>
      )}
    </Hoverable>
  );
}
