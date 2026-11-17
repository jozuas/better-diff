import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { UnchangedButton } from "./hunk-buttons";

function useStyles(theme: PluginTheme) {
  return useMemo(
    () =>
      StyleSheet.create({
        // As a hunk's bar, with only its middle.
        bar: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 12,
          paddingVertical: 6,
          backgroundColor: theme.colors.surface0,
        },
        line: {
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          height: 1,
          backgroundColor: theme.colors.border,
        },
      }),
    [theme],
  );
}

interface EndBarProps {
  path: string;
  // What its middle says of the unchanged lines after the last hunk, and whether it hides them,
  // rather than shows them.
  label: string;
  hides: boolean;
  onPress: () => void;
  theme: PluginTheme;
}

// A bar at the end of a file's diff, as a hunk's without a hunk: a line across the diff, with how
// many unchanged lines are left out after the last hunk in its middle, which shows them, or once
// they show, while the pointer is over the bar, what hides them again.
export function EndBar({ path, label, hides, onPress, theme }: EndBarProps): ReactElement {
  const styles = useStyles(theme);
  const [pointed, setPointed] = useState(false);

  return (
    <View
      role="group"
      accessibilityLabel={`End of ${path}`}
      style={styles.bar}
      onPointerEnter={() => {
        setPointed(true);
      }}
      onPointerLeave={() => {
        setPointed(false);
      }}
    >
      <View role="separator" style={styles.line} />
      <UnchangedButton
        label={label}
        hides={hides}
        hidden={hides && !pointed}
        keyed={false}
        onPress={onPress}
        theme={theme}
      />
    </View>
  );
}
