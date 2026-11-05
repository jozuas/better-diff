import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import { useContext, useId, useMemo, useSyncExternalStore } from "react";
import type { PressableProps, StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";

import { buttonLook, buttonText, sidebarButtonName } from "./actions";
import type { ButtonLook, Controls, SidebarAction } from "./actions";
import type { Target } from "./apply";
import { FontSizesContext } from "./fonts";
import { Hoverable, TintLayer } from "./hoverable";
import type { Look } from "./reveal";
import { overlayId } from "./web";

// What hears the pointer and focus coming into a row and leaving it.
type RevealHandlers = Pick<PressableProps, "onHoverIn" | "onHoverOut" | "onFocus" | "onBlur">;

function useStyles(theme: PluginTheme) {
  const fonts = useContext(FontSizesContext);

  return useMemo(() => {
    // The icon's colour, or the armed button's text's, and its tint's, by how the button looks.
    const faces: Record<ButtonLook, string> = {
      // As readable as the theme's danger colour is on its surface.
      armed: theme.colors.surface0,
      warning: theme.colors.statusDanger,
      hovered: theme.colors.foreground,
      plain: theme.colors.foregroundMuted,
    };

    return {
      ...StyleSheet.create({
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
        icon: { padding: 3, borderRadius: 4, overflow: "hidden" },
        armed: {
          paddingHorizontal: 6,
          paddingVertical: 1,
          borderRadius: 4,
          overflow: "hidden",
          backgroundColor: theme.colors.statusDanger,
        },
        armedText: { fontSize: fonts.small, color: faces.armed },
        hidden: { opacity: 0 },
      }),
      faces,
    };
  }, [theme, fonts]);
}

type Styles = ReturnType<typeof useStyles>;

interface FaceProps {
  action: SidebarAction;
  look: ButtonLook;
  styles: Styles;
}

// The action's icon, or what it asks while armed.
function Face({ action, look, styles }: FaceProps): ReactElement {
  return look === "armed" ? (
    <Text selectable={false} style={styles.armedText}>
      {buttonText(action, true)}
    </Text>
  ) : (
    <Icon name={action.icon} size={14} color={styles.faces[look]} />
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
}: SidebarButtonProps): ReactElement {
  const button = `${row}:${action.operation}`;
  // Only arming it or disarming it, or an action starting or ending, renders it again.
  const armed = useSyncExternalStore(controls.subscribe, () => controls.state().armed === button);
  const busy = useSyncExternalStore(controls.subscribe, () => controls.state().busy);

  return (
    <Hoverable
      accessibilityRole="button"
      accessibilityLabel={sidebarButtonName(action, armed, path)}
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      style={[armed ? styles.armed : styles.icon, hidden && styles.hidden]}
      onPress={() => {
        controls.press(button, action, target);
      }}
      {...reveal}
    >
      {({ hovered, pressed }) => {
        const look = buttonLook(action, armed, hovered);

        return (
          <>
            <TintLayer color={styles.faces[look]} hovered={hovered} pressed={pressed} />
            <Face action={action} look={look} styles={styles} />
          </>
        );
      }}
    </Hoverable>
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
  const id = useId();

  return (
    <View
      nativeID={overlayId(id)}
      pointerEvents={hidden ? "none" : "auto"}
      style={[styles.buttons, background]}
    >
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
        />
      ))}
    </View>
  );
}
