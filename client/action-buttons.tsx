import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { buttonText } from "./actions";
import type { Action, Controls } from "./actions";
import type { Target } from "./apply";

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
      // As readable as the theme's danger colour is on its surface.
      armedText: { fontSize: 12, color: theme.colors.surface0 },
      hidden: { opacity: 0 },
    });
  }, [theme, color]);
}

type Styles = ReturnType<typeof useStyles>;

interface LabelProps {
  text: string;
  armed: boolean;
  styles: Styles;
}

function Label({ text, armed, styles }: LabelProps): ReactElement {
  return (
    <Text selectable={false} style={armed ? styles.armedText : styles.text}>
      {text}
    </Text>
  );
}

interface ActionButtonProps {
  action: Action;
  armed: boolean;
  busy: boolean;
  hidden: boolean;
  onPress: () => void;
  styles: Styles;
}

function ActionButton({
  action,
  armed,
  busy,
  hidden,
  onPress,
  styles,
}: ActionButtonProps): ReactElement {
  const text = buttonText(action, armed);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      style={[armed ? styles.armed : styles.button, hidden && styles.hidden]}
      onPress={onPress}
    >
      <Label text={text} armed={armed} styles={styles} />
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
  onRun?: (() => void) | undefined;
  hidden?: boolean;
  // The buttons' colour, against the bar's.
  color: string;
  theme: PluginTheme;
}

// A bar's actions, on its right. Hidden ones can still be reached with the keyboard.
export function ActionButtons({
  actions,
  bar,
  target,
  controls,
  onRun,
  hidden = false,
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
          hidden={hidden}
          onPress={() => {
            controls.press(`${bar}:${action.operation}`, action, target, onRun);
          }}
          styles={styles}
        />
      ))}
    </View>
  );
}
