import type { PluginSerializableIcon, PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet } from "react-native";

import { Hoverable, TintLayer } from "./hoverable";

const styles = StyleSheet.create({
  button: { alignSelf: "center", padding: 2, borderRadius: 4, overflow: "hidden" },
  hidden: { opacity: 0 },
});

interface IconButtonProps {
  // What pressing it does.
  label: string;
  // A Lucide icon's name, or an SVG.
  icon: PluginSerializableIcon;
  onPress: () => void;
  hidden?: boolean;
  style?: StyleProp<ViewStyle>;
  theme: PluginTheme;
}

// An icon that brightens while the pointer is over it. Hidden, it can still be reached with the
// keyboard.
export function IconButton({
  label,
  icon,
  onPress,
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
            <TintLayer color={color} hovered={hovered} pressed={pressed} />
            <Icon icon={icon} size={15} color={color} />
          </>
        );
      }}
    </Hoverable>
  );
}
