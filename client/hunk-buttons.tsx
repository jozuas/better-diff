import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement } from "react";

import { ActionButtons } from "./action-buttons";
import type { Controls } from "./actions";
import { IconButton } from "./icon-button";
import { entireFileIcon, onlyHunksIcon } from "./icons";
import { chordOf } from "./keymap";
import { shortcutText } from "./shortcuts";
import type { Bar } from "./shortcuts";
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
export function EntireFileToggle({
  entire,
  onPress,
  hidden,
  theme,
}: EntireFileToggleProps): ReactElement {
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

interface LineButtonsProps {
  // The selected lines' actions, while the hunk has any.
  bar: Bar | undefined;
  // Whether focus is on the hunk's bar itself, where Enter and Backspace press them.
  keyed: boolean;
  controls: Controls;
  theme: PluginTheme;
}

// The actions on the hunk's selected lines, while it has any.
export function LineButtons({
  bar,
  keyed,
  controls,
  theme,
}: LineButtonsProps): ReactElement | null {
  return bar === undefined ? null : (
    <ActionButtons
      {...bar}
      level="part"
      place="lines"
      keyed={keyed}
      controls={controls}
      color={theme.colors.foreground}
      theme={theme}
    />
  );
}
