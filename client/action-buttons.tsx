import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { useContext, useMemo, useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";

import { buttonLook, buttonOf, buttonText } from "./actions";
import type { Action, ButtonLook, Controls } from "./actions";
import type { Target } from "./apply";
import { FontSizesContext } from "./fonts";
import { Hoverable, TintLayer } from "./hoverable";
import type { Place } from "./keymap";
import { ShortcutTip } from "./shortcut-tip";
import { buttonShortcut } from "./shortcuts";
import type { Level } from "./shortcuts";
import { onMac } from "./web";

function useStyles(theme: PluginTheme, color: string) {
  const fonts = useContext(FontSizesContext);

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
        button: { borderRadius: 6 },
        hidden: { opacity: 0 },
        box: {
          height: fonts.button,
          justifyContent: "center",
          paddingHorizontal: fonts.buttonPadding,
          borderRadius: 6,
          overflow: "hidden",
        },
        armed: { backgroundColor: theme.colors.statusDanger },
        text: { fontSize: fonts.small },
      }),
      labels,
    };
  }, [theme, color, fonts]);
}

type Styles = ReturnType<typeof useStyles>;

interface ActionButtonProps {
  action: Action;
  // How its shortcut is written, if it has one.
  shortcut: string | undefined;
  // Tells it apart from the panel's other buttons.
  button: string;
  controls: Controls;
  hidden: boolean;
  onPress: () => void;
  styles: Styles;
  theme: PluginTheme;
}

function ActionButton({
  action,
  shortcut,
  button,
  controls,
  hidden,
  onPress,
  styles,
  theme,
}: ActionButtonProps): ReactElement {
  // Only arming it or disarming it, or an action starting or ending, renders it again.
  const armed = useSyncExternalStore(controls.subscribe, () => controls.state().armed === button);
  const busy = useSyncExternalStore(controls.subscribe, () => controls.state().busy);
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
          <>
            <View style={[styles.box, armed && styles.armed]}>
              <TintLayer
                color={styles.labels[look]}
                hovered={hovered}
                pressed={pressed}
                filled={!armed}
              />
              <Text selectable={false} style={[styles.text, { color: styles.labels[look] }]}>
                {text}
              </Text>
            </View>
            <ShortcutTip shortcut={shortcut} resting={hovered && !pressed} theme={theme} />
          </>
        );
      }}
    </Hoverable>
  );
}

interface ActionButtonsProps {
  actions: readonly Action[];
  // Tells the bar's buttons apart from other bars'.
  bar: string;
  // What the bar's actions act on.
  target: Target;
  // What their shortcuts act on, if they have any, which shows under a button the pointer rests on.
  level?: Level;
  // Where focus is while their keys press them.
  place: Place;
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
  level,
  place,
  controls,
  onRun,
  hidden = false,
  color,
  theme,
}: ActionButtonsProps): ReactElement {
  const styles = useStyles(theme, color);
  const mac = onMac();

  return (
    <View style={styles.buttons}>
      {actions.map((action) => (
        <ActionButton
          key={action.operation}
          action={action}
          shortcut={buttonShortcut(action, level, place, mac)}
          button={buttonOf(bar, action)}
          controls={controls}
          hidden={hidden}
          onPress={() => {
            controls.press(buttonOf(bar, action), action, target, onRun);
          }}
          styles={styles}
          theme={theme}
        />
      ))}
    </View>
  );
}
