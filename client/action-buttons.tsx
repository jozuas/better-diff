import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { buttonText } from "./actions";
import type { Action, Controls, Target } from "./actions";

function useStyles(theme: PluginTheme, color: string) {
  return useMemo(() => {
    const button = {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: color,
    };

    return StyleSheet.create({
      buttons: { flexDirection: "row", gap: 6, marginLeft: "auto" },
      button,
      armed: {
        ...button,
        borderColor: theme.colors.statusDanger,
        backgroundColor: theme.colors.statusDanger,
      },
      text: { fontSize: 12, color },
      armedText: { fontSize: 12, color: theme.colors.accentForeground },
    });
  }, [theme, color]);
}

type Styles = ReturnType<typeof useStyles>;

interface ActionButtonProps {
  action: Action;
  armed: boolean;
  busy: boolean;
  onPress: () => void;
  styles: Styles;
}

function ActionButton({ action, armed, busy, onPress, styles }: ActionButtonProps): ReactElement {
  const text = buttonText(action, armed);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      style={armed ? styles.armed : styles.button}
      onPress={onPress}
    >
      <Text selectable={false} style={armed ? styles.armedText : styles.text}>
        {text}
      </Text>
    </Pressable>
  );
}

interface ActionButtonsProps {
  actions: Action[];
  // Tells the bar's buttons apart from other bars'.
  bar: string;
  // What the bar's actions act on.
  target: Target;
  controls: Controls;
  // Called just before one of the actions runs.
  onRun?: () => void;
  // The buttons' colour, against the bar's.
  color: string;
  theme: PluginTheme;
}

// A bar's actions, on its right.
export function ActionButtons({
  actions,
  bar,
  target,
  controls,
  onRun,
  color,
  theme,
}: ActionButtonsProps): ReactElement {
  const styles = useStyles(theme, color);

  return (
    <View style={styles.buttons}>
      {actions.map((action) => (
        <ActionButton
          key={action.operation}
          action={action}
          armed={controls.armed === `${bar}:${action.operation}`}
          busy={controls.busy}
          onPress={() => {
            controls.press(`${bar}:${action.operation}`, action, target, onRun);
          }}
          styles={styles}
        />
      ))}
    </View>
  );
}
