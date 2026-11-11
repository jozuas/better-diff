import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { ReactElement, ReactNode } from "react";
import { useContext, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FontSizesContext } from "./fonts";
import { Hoverable, TintLayer } from "./hoverable";
import { IconButton } from "./icon-button";
import { entireFileIcon, onlyHunksIcon } from "./icons";
import { chordOf } from "./keymap";
import { unchangedLabel } from "./labels";
import { shortcutText } from "./shortcuts";
import { onMac } from "./web";

// What the toggle shows the entire file with, and only the hunks.
const toggles = {
  entire: { label: "Show entire file", icon: entireFileIcon },
  hunks: { label: "Show only modified hunks", icon: onlyHunksIcon },
};

interface EntireFileToggleProps {
  // Whether the view shows the entire file, rather than only its hunks.
  entire: boolean;
  onPress: () => void;
  hidden: boolean;
  theme: PluginTheme;
}

// Sublime Merge's icon for what it shows the view instead, which E in the hunk's bar does too.
function EntireFileToggle({ entire, onPress, hidden, theme }: EntireFileToggleProps): ReactElement {
  const toggle = entire ? toggles.hunks : toggles.entire;

  return (
    <IconButton
      label={toggle.label}
      icon={toggle.icon}
      onPress={onPress}
      shortcut={shortcutText(chordOf("bar", "more", onMac()), onMac())}
      hidden={hidden}
      theme={theme}
    />
  );
}

function useUnchangedStyles(theme: PluginTheme) {
  const fonts = useContext(FontSizesContext);

  return useMemo(
    () =>
      StyleSheet.create({
        // Rounded as its box is, for its focus ring.
        button: { borderRadius: 6 },
        // In the diff's background, over the line across the bar, which stops either side of it.
        box: {
          height: fonts.button,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: fonts.buttonPadding,
          borderRadius: 6,
          overflow: "hidden",
          backgroundColor: theme.colors.surface0,
        },
        text: { fontSize: fonts.small },
      }),
    [theme, fonts],
  );
}

interface UnchangedLinesProps {
  // How many unchanged lines the diff leaves out before the hunk.
  count: number;
  onPress: () => void;
  theme: PluginTheme;
}

// Says how many unchanged lines are left out before the hunk, as Linear's PR review does with its
// icon, and shows them, all at once rather than a few at a time as Linear's does. Nothing while
// none are.
function UnchangedLines({ count, onPress, theme }: UnchangedLinesProps): ReactElement | null {
  const styles = useUnchangedStyles(theme);
  const fonts = useContext(FontSizesContext);
  const label = unchangedLabel(count);

  if (count === 0) {
    return null;
  }

  return (
    <Hoverable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.button}
      onPress={onPress}
    >
      {({ hovered, pressed }) => {
        const color = hovered ? theme.colors.foreground : theme.colors.foregroundMuted;

        return (
          <View style={styles.box}>
            <TintLayer color={color} hovered={hovered} pressed={pressed} />
            <Icon name="UnfoldVertical" size={fonts.buttonIcon} color={color} />
            <Text selectable={false} style={[styles.text, { color }]}>
              {label}
            </Text>
          </View>
        );
      }}
    </Hoverable>
  );
}

function useBarStyles(theme: PluginTheme) {
  return useMemo(
    () =>
      StyleSheet.create({
        // Across the bar's middle, under what's on it.
        line: {
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          height: 1,
          backgroundColor: theme.colors.border,
        },
        // Between the toggle and the hunk's actions, centred.
        middle: { flex: 1, alignItems: "center" },
        // Over the line, which stops either side of what's on it while that shows.
        toggle: { paddingRight: 6 },
        actions: { flexDirection: "row", gap: 6, paddingLeft: 6 },
        masked: { backgroundColor: theme.colors.surface0 },
      }),
    [theme],
  );
}

interface HunkBarContentProps {
  // Whether the view shows the entire file, rather than only its hunks.
  entire: boolean;
  // Whether the toggle and the hunk's actions show.
  revealed: boolean;
  // How many unchanged lines are left out before the hunk, and whether a line across the bar
  // separates it from the file's lines above it.
  leftOut: number;
  separates: boolean;
  // Shows the entire file, or only the hunks again, and the unchanged lines above the hunk.
  onToggle: () => void;
  onOpen: () => void;
  // The hunk's actions.
  children: ReactNode;
  theme: PluginTheme;
}

// What's on a hunk's bar: a line across it, as Linear's PR review separates hunks, with how many
// unchanged lines are left out before the hunk in its middle, which shows them, the toggle between the entire file and
// only the hunks on its left, and the hunk's actions on its right.
export function HunkBarContent({
  entire,
  revealed,
  leftOut,
  separates,
  onToggle,
  onOpen,
  children,
  theme,
}: HunkBarContentProps): ReactElement {
  const styles = useBarStyles(theme);
  const masked = revealed ? styles.masked : undefined;

  return (
    <>
      {separates ? <View role="separator" style={styles.line} /> : null}
      <View style={[styles.toggle, masked]}>
        <EntireFileToggle entire={entire} onPress={onToggle} hidden={!revealed} theme={theme} />
      </View>
      <View style={styles.middle}>
        <UnchangedLines count={leftOut} onPress={onOpen} theme={theme} />
      </View>
      <View style={[styles.actions, masked]}>{children}</View>
    </>
  );
}
