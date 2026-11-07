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
import type { Place } from "./keymap";
import type { Look } from "./reveal";
import { ShortcutTip } from "./shortcut-tip";
import { shortcutOf, shortcutText } from "./shortcuts";
import { onMac, overlayId } from "./web";

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
  // Where focus is while its key presses it: in a file's row, or a group's heading.
  place: Place;
  target: Target;
  path: string | undefined;
  hidden: boolean;
  onRun: (() => void) | undefined;
  controls: Controls;
  reveal: RevealHandlers;
  styles: Styles;
  theme: PluginTheme;
}

// Its key, which acts on all of a file, or files, shows under it once the pointer rests on it.
function SidebarButton({
  action,
  row,
  place,
  target,
  path,
  hidden,
  onRun,
  controls,
  reveal,
  styles,
  theme,
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
        controls.press(button, action, target, onRun);
      }}
      {...reveal}
    >
      {({ hovered, pressed }) => {
        const look = buttonLook(action, armed, hovered);

        return (
          <>
            <TintLayer color={styles.faces[look]} hovered={hovered} pressed={pressed} />
            <Face action={action} look={look} styles={styles} />
            <ShortcutTip
              shortcut={shortcutText(shortcutOf(action, "file", place, onMac()), onMac())}
              resting={hovered && !pressed}
              theme={theme}
            />
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
  // Where focus is while their keys press them: in a file's row, or a group's heading.
  place: Place;
  target: Target;
  // The file they act on, which their names say, if they act on one.
  path?: string;
  // Called just before one of the actions runs.
  onRun: (() => void) | undefined;
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
  place,
  target,
  path,
  onRun,
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
          place={place}
          target={target}
          path={path}
          hidden={hidden}
          onRun={onRun}
          controls={controls}
          reveal={reveal}
          styles={styles}
          theme={theme}
        />
      ))}
    </View>
  );
}
