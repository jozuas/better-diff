import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement, Ref } from "react";
import { useContext, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { textButtonLook } from "./actions";
import type { TextLook } from "./actions";
import { FontSizesContext } from "./fonts";
import { Hoverable, TintLayer } from "./hoverable";

function useStyles(theme: PluginTheme) {
  const fonts = useContext(FontSizesContext);

  return useMemo(() => {
    const labels: Record<ReturnType<typeof textButtonLook>, string> = {
      plain: theme.colors.foreground,
      primary: theme.colors.accentForeground,
      armed: theme.colors.surface0,
      warning: theme.colors.statusDanger,
    };

    return {
      ...StyleSheet.create({
        // Rounded as its box is, for its focus ring.
        button: { borderRadius: 4 },
        box: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 4, overflow: "hidden" },
        plain: {},
        warning: {},
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
  look: TextLook;
  // Whether it asks for confirmation before it does what it's for.
  confirms?: boolean;
  disabled: boolean;
  buttonRef?: Ref<View> | undefined;
  theme: PluginTheme;
}

// A button with a label, tinted in its label's colour while the pointer is over it, and more while
// it's pressed, and in the danger colour then if it asks for confirmation.
export function TextButton({
  label,
  accessibilityLabel,
  onPress,
  look,
  confirms = false,
  disabled,
  buttonRef,
  theme,
}: TextButtonProps): ReactElement {
  const styles = useStyles(theme);

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
      {({ hovered, pressed }) => {
        const shown = textButtonLook(look, confirms, hovered);
        const color = styles.labels[shown];

        return (
          <View style={[styles.box, styles[shown]]}>
            <TintLayer
              color={color}
              hovered={hovered}
              pressed={pressed}
              filled={look === "plain"}
            />
            <Text selectable={false} style={[styles.text, { color }]}>
              {label}
            </Text>
          </View>
        );
      }}
    </Hoverable>
  );
}
