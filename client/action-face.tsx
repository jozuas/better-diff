import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import { useContext, useMemo } from "react";
import { StyleSheet, Text } from "react-native";

import { buttonText } from "./actions";
import type { ButtonLook, IconAction } from "./actions";
import { FontSizesContext } from "./fonts";
import { TintLayer } from "./hoverable";

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
      faces,
      ...StyleSheet.create({ armedText: { fontSize: fonts.small, color: faces.armed } }),
    };
  }, [theme, fonts]);
}

interface ActionFaceProps {
  action: IconAction;
  look: ButtonLook;
  // Whether the pointer is over the button, and whether it's pressed.
  hovered: boolean;
  pressed: boolean;
  size: number;
  theme: PluginTheme;
}

// An icon action's button's face: its icon, or what it asks while armed, tinted in its colour.
export function ActionFace({
  action,
  look,
  hovered,
  pressed,
  size,
  theme,
}: ActionFaceProps): ReactElement {
  const styles = useStyles(theme);

  return (
    <>
      <TintLayer color={styles.faces[look]} hovered={hovered} pressed={pressed} />
      {look === "armed" ? (
        <Text selectable={false} style={styles.armedText}>
          {buttonText(action, true)}
        </Text>
      ) : (
        <Icon name={action.icon} size={size} color={styles.faces[look]} />
      )}
    </>
  );
}
