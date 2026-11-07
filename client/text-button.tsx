import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement, Ref } from "react";
import { useContext, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FontSizesContext } from "./fonts";
import { Hoverable, TintLayer } from "./hoverable";

// How a text button looks: plain, filled with a tint of its label's colour; primary, in the accent
// colour, as the one that does what what it's in is for; or armed, in the danger colour, as one
// that asks to be pressed again.
type Look = "plain" | "primary" | "armed";

function useStyles(theme: PluginTheme) {
  const fonts = useContext(FontSizesContext);

  return useMemo(() => {
    const labels: Record<Look, string> = {
      plain: theme.colors.foreground,
      primary: theme.colors.accentForeground,
      armed: theme.colors.surface0,
    };

    return {
      ...StyleSheet.create({
        // Rounded as its box is, for its focus ring.
        button: { borderRadius: 4 },
        box: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 4, overflow: "hidden" },
        plain: {},
        primary: { backgroundColor: theme.colors.accent },
        armed: { backgroundColor: theme.colors.statusDanger },
        disabled: { opacity: 0.5 },
        text: { fontSize: fonts.small },
      }),
      labels,
    };
  }, [theme, fonts]);
}

interface TextButtonProps {
  label: string;
  // What it's called, which says what it does where its label alone doesn't, as Cancel doesn't.
  accessibilityLabel: string;
  onPress: () => void;
  look: Look;
  disabled: boolean;
  buttonRef?: Ref<View> | undefined;
  theme: PluginTheme;
}

// A button with a label, tinted in its label's colour while the pointer is over it, and more while
// it's pressed.
export function TextButton({
  label,
  accessibilityLabel,
  onPress,
  look,
  disabled,
  buttonRef,
  theme,
}: TextButtonProps): ReactElement {
  const styles = useStyles(theme);
  const color = styles.labels[look];

  return (
    <Hoverable
      ref={buttonRef}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={[styles.button, disabled && styles.disabled]}
      onPress={onPress}
    >
      {({ hovered, pressed }) => (
        <View style={[styles.box, styles[look]]}>
          <TintLayer color={color} hovered={hovered} pressed={pressed} filled={look === "plain"} />
          <Text selectable={false} style={[styles.text, { color }]}>
            {label}
          </Text>
        </View>
      )}
    </Hoverable>
  );
}
