import type { PluginSerializableIcon, PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";

import { Hoverable, TintLayer } from "./hoverable";
import { ShortcutTip } from "./shortcut-tip";

const styles = StyleSheet.create({
  // Rounded as its face is, for its focus ring.
  button: { alignSelf: "center", borderRadius: 4 },
  face: { padding: 2, borderRadius: 4, overflow: "hidden" },
  hidden: { opacity: 0 },
});

interface IconButtonProps {
  // What pressing it does.
  label: string;
  // A Lucide icon's name, or an SVG.
  icon: PluginSerializableIcon;
  onPress: () => void;
  // How its key is written, if it has one, which shows under it once the pointer rests on it.
  shortcut?: string | undefined;
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
  hidden = false,
  style,
  theme,
}: IconButtonProps): ReactElement {
  return (
    <Hoverable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.button, style, hidden && styles.hidden]}
      onPress={onPress}
    >
      {({ hovered, pressed }) => {
        const color = hovered ? theme.colors.foreground : theme.colors.foregroundMuted;

        return (
          <>
            <View style={styles.face}>
              <TintLayer color={color} hovered={hovered} pressed={pressed} />
              <Icon icon={icon} size={15} color={color} />
            </View>
            <ShortcutTip shortcut={shortcut} resting={hovered && !pressed} theme={theme} />
          </>
        );
      }}
    </Hoverable>
  );
}
