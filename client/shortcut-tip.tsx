import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { useContext, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FontSizesContext } from "./fonts";

// How long the pointer rests on a button before its shortcut shows.
const delay = 1000;

function useStyles(theme: PluginTheme) {
  const fonts = useContext(FontSizesContext);

  return useMemo(
    () =>
      StyleSheet.create({
        // Under the button, from its right edge, as its bar's buttons are at the bar's end.
        tip: {
          position: "absolute",
          top: "100%",
          right: 0,
          marginTop: 4,
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderWidth: 1,
          borderRadius: 4,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface0,
          boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
        },
        // Larger than the button's label, as a key's symbol is hard to read small.
        text: { fontSize: fonts.text, color: theme.colors.foreground },
      }),
    [theme, fonts],
  );
}

// Whether `on` has stayed true for the delay since it last turned true.
function useAfterDelay(on: boolean): boolean {
  const [late, setLate] = useState(false);

  useEffect(() => {
    // Until `on` changes again.
    let latest = true;

    if (on) {
      setTimeout(() => {
        setLate(latest);
      }, delay);
    }

    return () => {
      latest = false;
      setLate(false);
    };
  }, [on]);

  return on && late;
}

interface ShortcutTipProps {
  // How the shortcut is written, if the button has one.
  shortcut: string | undefined;
  // Whether the pointer is over the button, and not pressing it.
  resting: boolean;
  theme: PluginTheme;
}

// The button's shortcut, which shows under it once the pointer rests on it, to teach it. The pointer
// passes through it to what's under it.
export function ShortcutTip({ shortcut, resting, theme }: ShortcutTipProps): ReactElement | null {
  const styles = useStyles(theme);
  const shown = useAfterDelay(resting);

  return shown && shortcut !== undefined ? (
    <View role="tooltip" pointerEvents="none" style={styles.tip}>
      <Text selectable={false} numberOfLines={1} style={styles.text}>
        {shortcut}
      </Text>
    </View>
  ) : null;
}
