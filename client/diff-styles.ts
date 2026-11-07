// Stryker disable all: this module imports react-native, which Vitest can't load.
import type { PluginTheme } from "@getpaseo/plugin";
import { createContext, useContext, useMemo } from "react";
import { processColor, StyleSheet } from "react-native";

import { viewSettings } from "../shared/settings";
import { FontSizesContext, textPadding } from "./fonts";
import type { FontSizes } from "./fonts";
import { tintOf } from "./tints";

declare module "react-native" {
  interface TextStyle {
    // CSS's, which React Native Web passes on.
    tabSize?: number;
  }
}

// How many columns apart a diff's lines' tab stops are, as the settings say.
export const TabSizeContext = createContext(viewSettings.schema.parse({}).tabSize);

// Paseo's own monospace fonts.
const monospace =
  "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

function stylesOf(theme: PluginTheme, fonts: FontSizes, tabSize: number) {
  return StyleSheet.create({
    line: { flexDirection: "row" },
    // A line's tint as removed or added, as its own background: a translucent layer under it would
    // be one more element to render for each line.
    context: {},
    removed: { backgroundColor: tintOf(processColor(theme.colors.statusDanger), 0.15) },
    added: { backgroundColor: tintOf(processColor(theme.colors.statusSuccess), 0.15) },
    // Over the tint, a removed or added line's changed words.
    contextWords: {},
    removedWords: { backgroundColor: tintOf(processColor(theme.colors.statusDanger), 0.3) },
    addedWords: { backgroundColor: tintOf(processColor(theme.colors.statusSuccess), 0.3) },
    // Over that, the spaces and tabs an added line ends with, in red, as Magit and git mark them.
    trailingWhitespace: { backgroundColor: theme.colors.statusDanger },
    // Over all of those, what the find bar found, in the theme's warning colour, and the current
    // match more strongly, and outlined, which takes no room from the text around it.
    found: { backgroundColor: tintOf(processColor(theme.colors.statusWarning), 0.3) },
    currentFound: {
      backgroundColor: tintOf(processColor(theme.colors.statusWarning), 0.5),
      outlineWidth: 1,
      outlineStyle: "solid",
      outlineColor: theme.colors.statusWarning,
    },
    number: {
      width: fonts.number,
      paddingRight: 8,
      textAlign: "right",
      fontFamily: monospace,
      fontSize: fonts.code,
      lineHeight: fonts.codeLine,
      color: theme.colors.foregroundMuted,
    },
    selected: { color: theme.colors.surface0, backgroundColor: theme.colors.foregroundMuted },
    text: {
      flex: 1,
      paddingHorizontal: textPadding,
      fontFamily: monospace,
      fontSize: fonts.code,
      lineHeight: fonts.codeLine,
      color: theme.colors.foreground,
      tabSize,
    },
    noNewline: {
      fontSize: fonts.code,
      lineHeight: fonts.codeLine,
      color: theme.colors.foregroundMuted,
    },
    // Each side of a side-by-side row, with a line between them.
    half: { flex: 1, minWidth: 0 },
    old: {},
    new: { borderLeftWidth: 1, borderColor: theme.colors.border },
    // Where a side has no line level with the other's.
    filler: { flex: 1, backgroundColor: theme.colors.surface1 },
    // What starts a comment on the line the pointer is over, at the start of its numbers, where they
    // leave room, and clear of its text, which a selection starts in. Like the numbers, it's no part
    // of the text a selection of lines has.
    comment: {
      position: "absolute",
      userSelect: "none",
      top: 1,
      left: 2,
      width: fonts.codeLine - 2,
      height: fonts.codeLine - 2,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 4,
      backgroundColor: theme.colors.accent,
    },
    commentPlus: {
      fontSize: fonts.code + 2,
      lineHeight: fonts.codeLine - 2,
      fontWeight: "700",
      color: theme.colors.accentForeground,
    },
  });
}

export type Styles = ReturnType<typeof stylesOf>;

// The styles of a diff's lines, inline or side by side.
export function useStyles(theme: PluginTheme): Styles {
  const fonts = useContext(FontSizesContext);
  const tabSize = useContext(TabSizeContext);

  return useMemo(() => stylesOf(theme, fonts, tabSize), [theme, fonts, tabSize]);
}
