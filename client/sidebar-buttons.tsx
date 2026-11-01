import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import { useMemo } from "react";
import type { PressableProps, StyleProp, ViewStyle } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { buttonText, sidebarButtonName } from "./actions";
import type { Controls, SidebarAction } from "./actions";
import type { Target } from "./apply";
import type { Look } from "./reveal";

// What hears the pointer and focus coming into a row and leaving it.
type RevealHandlers = Pick<PressableProps, "onHoverIn" | "onHoverOut" | "onFocus" | "onBlur">;

function useStyles(theme: PluginTheme) {
  return useMemo(
    () =>
      StyleSheet.create({
        // Over the end of the row, taking no room from what it shows.
        buttons: {
          position: "absolute",
          top: 0,
          bottom: 0,
          right: 0,
          flexDirection: "row",
          alignItems: "center",
          gap: 2,
          paddingHorizontal: 6,
        },
        icon: { padding: 3, borderRadius: 4 },
        armed: {
          paddingHorizontal: 6,
          paddingVertical: 1,
          borderRadius: 4,
          backgroundColor: theme.colors.statusDanger,
        },
        armedText: { fontSize: 12, color: theme.colors.accentForeground },
        hidden: { opacity: 0 },
      }),
    [theme],
  );
}

type Styles = ReturnType<typeof useStyles>;

interface FaceProps {
  action: SidebarAction;
  armed: boolean;
  styles: Styles;
  theme: PluginTheme;
}

// The action's icon, or what it asks while armed.
function Face({ action, armed, styles, theme }: FaceProps): ReactElement {
  return armed ? (
    <Text selectable={false} style={styles.armedText}>
      {buttonText(action, armed)}
    </Text>
  ) : (
    <Icon name={action.icon} size={14} color={theme.colors.foregroundMuted} />
  );
}

interface SidebarButtonProps {
  action: SidebarAction;
  row: string;
  target: Target;
  path: string | undefined;
  hidden: boolean;
  controls: Controls;
  reveal: RevealHandlers;
  styles: Styles;
  theme: PluginTheme;
}

function SidebarButton({
  action,
  row,
  target,
  path,
  hidden,
  controls,
  reveal,
  styles,
  theme,
}: SidebarButtonProps): ReactElement {
  const button = `${row}:${action.operation}`;
  const armed = controls.armed === button;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sidebarButtonName(action, armed, path)}
      accessibilityState={{ disabled: controls.busy }}
      disabled={controls.busy}
      style={[armed ? styles.armed : styles.icon, hidden && styles.hidden]}
      onPress={() => {
        controls.press(button, action, target);
      }}
      {...reveal}
    >
      <Face action={action} armed={armed} styles={styles} theme={theme} />
    </Pressable>
  );
}

interface SidebarButtonsProps {
  actions: SidebarAction[];
  // Tells the row's buttons apart from other rows'.
  row: string;
  target: Target;
  // The file they act on, which their names say, if they act on one.
  path?: string;
  // Plain hides them.
  look: Look;
  // The row's background, which they cover the end of the row with.
  background: StyleProp<ViewStyle>;
  controls: Controls;
  reveal: RevealHandlers;
  theme: PluginTheme;
}

// A sidebar row's actions, at its end. Hidden ones can still be reached with the keyboard, which
// shows them.
export function SidebarButtons({
  actions,
  row,
  target,
  path,
  look,
  background,
  controls,
  reveal,
  theme,
}: SidebarButtonsProps): ReactElement {
  const styles = useStyles(theme);
  const hidden = look === "plain";

  return (
    <View pointerEvents={hidden ? "none" : "auto"} style={[styles.buttons, background]}>
      {actions.map((action) => (
        <SidebarButton
          key={action.operation}
          action={action}
          row={row}
          target={target}
          path={path}
          hidden={hidden}
          controls={controls}
          reveal={reveal}
          styles={styles}
          theme={theme}
        />
      ))}
    </View>
  );
}
