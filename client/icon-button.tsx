import type { PluginSerializableIcon, PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import { useContext, useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";

import { FontSizesContext } from "./fonts";
import { Hoverable, TintLayer } from "./hoverable";
import { NameTip, ShortcutTip } from "./shortcut-tip";

function useStyles() {
  const fonts = useContext(FontSizesContext);

  return useMemo(
    () => ({
      ...StyleSheet.create({
        // Rounded as its face is, for its focus ring.
        button: { alignSelf: "center", borderRadius: 6 },
        face: {
          width: fonts.button,
          height: fonts.button,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
          overflow: "hidden",
        },
        hidden: { opacity: 0 },
      }),
      iconSize: fonts.buttonIcon,
    }),
    [fonts],
  );
}

interface IconButtonProps {
  // What pressing it does.
  label: string;
  // A Lucide icon's name, or an SVG.
  icon: PluginSerializableIcon;
  onPress: () => void;
  // How its key is written, if it has one, which shows under it once the pointer rests on it.
  shortcut?: string | undefined;
  // Its name, if it shows above it once the pointer rests on it, as where nothing near it says what
  // it does.
  name?: string | undefined;
  hidden?: boolean;
  style?: StyleProp<ViewStyle>;
  theme: PluginTheme;
}

// An icon that brightens while the pointer is over it.
export function IconButton({
  label,
  icon,
  onPress,
  shortcut,
  name,
  hidden = false,
  style,
  theme,
}: IconButtonProps): ReactElement {
  const styles = useStyles();

  return (
    <Hoverable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.button, style, hidden && styles.hidden]}
      onPress={onPress}
    >
      {({ hovered, pressed }) => {
        const color = hovered ? theme.colors.foreground : theme.colors.foregroundMuted;
        const resting = hovered && !pressed;

        return (
          <>
            <View style={styles.face}>
              <TintLayer color={color} hovered={hovered} pressed={pressed} />
              <Icon icon={icon} size={styles.iconSize} color={color} />
            </View>
            <ShortcutTip shortcut={shortcut} resting={resting} theme={theme} />
            <NameTip name={name} resting={resting} theme={theme} />
          </>
        );
      }}
    </Hoverable>
  );
}
