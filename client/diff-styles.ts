// Stryker disable all: this module imports react-native, which Vitest can't load.
import type { PluginTheme } from "@getpaseo/plugin";
import { useContext, useMemo } from "react";
import { processColor, StyleSheet } from "react-native";

import { FontSizesContext, textPadding } from "./fonts";
import type { FontSizes } from "./fonts";
import { tintOf } from "./tints";

// Paseo's own monospace fonts.
const monospace =
  "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

function stylesOf(theme: PluginTheme, fonts: FontSizes) {
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
  });
}

export type Styles = ReturnType<typeof stylesOf>;

// The styles of a diff's lines, inline or side by side.
export function useStyles(theme: PluginTheme): Styles {
  const fonts = useContext(FontSizesContext);

  return useMemo(() => stylesOf(theme, fonts), [theme, fonts]);
}
