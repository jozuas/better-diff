import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { buttonLook, buttonText } from "./actions";
import type { Action, ButtonLook, Controls } from "./actions";
import type { Target } from "./apply";
import { Hoverable, TintLayer } from "./hoverable";

function useStyles(theme: PluginTheme, color: string) {
  return useMemo(() => {
    // The label's colour, and its tint's, by how the button looks.
    const labels: Record<ButtonLook, string> = {
      // As readable as the theme's danger colour is on its surface.
      armed: theme.colors.surface0,
      warning: theme.colors.statusDanger,
      hovered: color,
      plain: color,
    };

    return {
      ...StyleSheet.create({
        buttons: { flexDirection: "row", gap: 6, marginLeft: "auto" },
        // Rounded as its box is, for its focus ring.
        button: { borderRadius: 4 },
        hidden: { opacity: 0 },
        box: {
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 4,
          borderWidth: 1,
          overflow: "hidden",
        },
        text: { fontSize: 12 },
      }),
      // The box's colours, by how the button looks.
      boxes: StyleSheet.create({
        armed: {
          borderColor: theme.colors.statusDanger,
          backgroundColor: theme.colors.statusDanger,
        },
        warning: { borderColor: theme.colors.statusDanger },
        hovered: { borderColor: color },
        plain: { borderColor: color },
      }),
      labels,
    };
  }, [theme, color]);
}

type Styles = ReturnType<typeof useStyles>;

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
    <Hoverable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      style={[styles.button, hidden && styles.hidden]}
      onPress={onPress}
    >
      {({ hovered, pressed }) => {
        const look = buttonLook(action, armed, hovered);

        return (
          <View style={[styles.box, styles.boxes[look]]}>
            <TintLayer color={styles.labels[look]} hovered={hovered} pressed={pressed} />
            <Text selectable={false} style={[styles.text, { color: styles.labels[look] }]}>
              {text}
            </Text>
          </View>
        );
      }}
    </Hoverable>
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
