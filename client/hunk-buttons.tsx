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
import { unchangedButton } from "./labels";
import type { RunShown } from "./lines";
import { ShortcutTip } from "./shortcut-tip";
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

// Sublime Merge's icon for what it shows the view instead, which Shift+E in the hunk's bar does too.
function EntireFileToggle({ entire, onPress, hidden, theme }: EntireFileToggleProps): ReactElement {
  const toggle = entire ? toggles.hunks : toggles.entire;

  return (
    <IconButton
      label={toggle.label}
      icon={toggle.icon}
      onPress={onPress}
      shortcut={shortcutText(chordOf("bar", "moreFile", onMac()), onMac())}
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
        hidden: { opacity: 0 },
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
  // How many unchanged lines are before the hunk, after the hunk before it, and how they show.
  count: number;
  shown: RunShown;
  // Whether the hunk is revealed: what hides them shows only while it is.
  revealed: boolean;
  onPress: () => void;
  theme: PluginTheme;
}

interface UnchangedButtonProps {
  label: string;
  // Whether it hides the lines, rather than shows them, and whether it's hidden itself.
  hides: boolean;
  hidden: boolean;
  onPress: () => void;
  theme: PluginTheme;
}

// Says how many unchanged lines are left out before the hunk, as Linear's PR review does with its
// icon, arrows pointing out from a line, and shows them, all at once rather than a few at a time as
// Linear's does, or while they show and the hunk is revealed, hides them again, with arrows pointing
// in to the line. E in the hunk's bar does too.
function UnchangedButton({
  label,
  hides,
  hidden,
  onPress,
  theme,
}: UnchangedButtonProps): ReactElement {
  const styles = useUnchangedStyles(theme);
  const fonts = useContext(FontSizesContext);
  const icon = hides ? "FoldVertical" : "UnfoldVertical";

  return (
    <Hoverable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.button, hidden && styles.hidden]}
      onPress={onPress}
    >
      {({ hovered, pressed }) => {
        const color = hovered ? theme.colors.foreground : theme.colors.foregroundMuted;

        return (
          <>
            <View style={styles.box}>
              <TintLayer color={color} hovered={hovered} pressed={pressed} />
              <Icon name={icon} size={fonts.buttonIcon} color={color} />
              <Text selectable={false} style={[styles.text, { color }]}>
                {label}
              </Text>
            </View>
            <ShortcutTip
              shortcut={shortcutText(chordOf("bar", "more", onMac()), onMac())}
              resting={hovered && !pressed}
              theme={theme}
            />
          </>
        );
      }}
    </Hoverable>
  );
}

// What shows or hides the unchanged lines before the hunk: nothing while there are none, or a
// comment keeps them shown.
function UnchangedLines({
  count,
  shown,
  revealed,
  onPress,
  theme,
}: UnchangedLinesProps): ReactElement | null {
  const button = unchangedButton(count, shown);

  return button === undefined ? null : (
    <UnchangedButton
      {...button}
      hidden={button.hides && !revealed}
      onPress={onPress}
      theme={theme}
    />
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
        // Either side of the middle, as wide as each other, so the middle is in the bar's middle
        // whatever is on them, until one needs more room than that and takes it from the other.
        side: { flex: 1, flexDirection: "row", minWidth: "auto" },
        end: { justifyContent: "flex-end" },
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
  // Whether the toggle, the hunk's actions, and what hides the unchanged lines above it show.
  revealed: boolean;
  // How many unchanged lines are before the hunk, how they show, and whether a line across the bar
  // separates it from the file's lines above it.
  unchanged: number;
  unchangedShown: RunShown;
  separates: boolean;
  // Shows the entire file, or only the hunks again, and the unchanged lines above the hunk, or
  // hides them.
  onToggle: () => void;
  onUnchanged: () => void;
  // The hunk's actions.
  children: ReactNode;
  theme: PluginTheme;
}

// What's on a hunk's bar: a line across it, as Linear's PR review separates hunks, with how many
// unchanged lines are left out before the hunk in its middle, which shows them, or while they show
// and it's revealed, what hides them, the toggle between the entire file and only the hunks on its
// left, and the hunk's actions on its right.
export function HunkBarContent({
  entire,
  revealed,
  unchanged,
  unchangedShown,
  separates,
  onToggle,
  onUnchanged,
  children,
  theme,
}: HunkBarContentProps): ReactElement {
  const styles = useBarStyles(theme);
  const masked = revealed ? styles.masked : undefined;

  return (
    <>
      {separates ? <View role="separator" style={styles.line} /> : null}
      <View style={styles.side}>
        <View style={[styles.toggle, masked]}>
          <EntireFileToggle entire={entire} onPress={onToggle} hidden={!revealed} theme={theme} />
        </View>
      </View>
      <UnchangedLines
        count={unchanged}
        shown={unchangedShown}
        revealed={revealed}
        onPress={onUnchanged}
        theme={theme}
      />
      <View style={[styles.side, styles.end]}>
        <View style={[styles.actions, masked]}>{children}</View>
      </View>
    </>
  );
}
