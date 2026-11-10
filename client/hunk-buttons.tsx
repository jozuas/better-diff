import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement } from "react";

import { IconButton } from "./icon-button";
import { entireFileIcon, onlyHunksIcon } from "./icons";
import { chordOf } from "./keymap";
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
