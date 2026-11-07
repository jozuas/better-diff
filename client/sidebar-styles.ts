// Stryker disable all: this module imports react-native, which Vitest can't load.
import type { PluginTheme } from "@getpaseo/plugin";
import { useContext, useMemo } from "react";
import { StyleSheet } from "react-native";

import { FontSizesContext } from "./fonts";
import type { FontSizes } from "./fonts";

// The styles of the sidebar's groups: their headings and their files' rows.
function stylesOf(theme: PluginTheme, fonts: FontSizes) {
  return StyleSheet.create({
    group: { marginBottom: 12 },
    // Hovering it reveals its buttons, though it does nothing pressed.
    headingRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingRight: 12,
      paddingVertical: 4,
      cursor: "auto",
    },
    // In the gutter left of the heading, which lines the heading up with the files under it.
    toggle: { width: 16, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
    // Drawn by its left border between transparent top and bottom ones, so it points right, and
    // down once turned.
    triangle: {
      borderTopWidth: 4,
      borderBottomWidth: 4,
      borderLeftWidth: 6,
      borderTopColor: "transparent",
      borderBottomColor: "transparent",
      borderLeftColor: theme.colors.foregroundMuted,
    },
    hoveredTriangle: { borderLeftColor: theme.colors.foreground },
    turned: { transform: [{ rotate: "90deg" }] },
    headingButton: { flex: 1 },
    heading: {
      fontSize: fonts.label,
      fontWeight: "600",
      letterSpacing: 0.5,
      color: theme.colors.foreground,
    },
    row: { paddingLeft: 16, paddingRight: 12, paddingVertical: 3 },
    path: { fontSize: fonts.text, color: theme.colors.foreground },
    // As Paseo's Changes tab dims a file's name while it isn't hovered or selected.
    dimmedPath: { opacity: 0.76 },
    pending: { flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 0 },
    pendingCount: { fontSize: fonts.small, color: theme.colors.foregroundMuted },
    plain: {},
    revealed: { backgroundColor: theme.colors.surface1 },
    open: { backgroundColor: theme.colors.surface2 },
  });
}

export type SidebarStyles = ReturnType<typeof stylesOf>;

export function useStyles(theme: PluginTheme): SidebarStyles {
  const fonts = useContext(FontSizesContext);

  return useMemo(() => stylesOf(theme, fonts), [theme, fonts]);
}
