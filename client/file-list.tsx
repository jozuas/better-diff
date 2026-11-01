import type { PluginTheme } from "@getpaseo/plugin";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { isOpen } from "./groups";
import type { OpenFile, SidebarGroup } from "./groups";

function useStyles(theme: PluginTheme) {
  return useMemo(
    () =>
      StyleSheet.create({
        list: { paddingVertical: 8 },
        group: { marginBottom: 12 },
        heading: {
          paddingHorizontal: 12,
          paddingVertical: 4,
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.5,
          color: theme.colors.foregroundMuted,
        },
        row: { paddingHorizontal: 12, paddingVertical: 3 },
        openRow: {
          paddingHorizontal: 12,
          paddingVertical: 3,
          backgroundColor: theme.colors.surface2,
        },
        path: { fontSize: 13, color: theme.colors.foreground },
      }),
    [theme],
  );
}

type Styles = ReturnType<typeof useStyles>;

interface FileRowProps {
  path: string;
  open: boolean;
  onPress: () => void;
  styles: Styles;
}

function FileRow({ path, open, onPress, styles }: FileRowProps): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={path}
      accessibilityState={{ selected: open }}
      style={open ? styles.openRow : styles.row}
      onPress={onPress}
    >
      <Text numberOfLines={1} style={styles.path}>
        {path}
      </Text>
    </Pressable>
  );
}

interface FileListProps {
  groups: SidebarGroup[];
  open: OpenFile | undefined;
  onOpen: (file: OpenFile) => void;
  theme: PluginTheme;
}

// The changed files, in their groups.
export function FileList({ groups, open, onOpen, theme }: FileListProps): ReactElement {
  const styles = useStyles(theme);

  return (
    <ScrollView contentContainerStyle={styles.list}>
      {groups.map(({ name, heading, paths }) => (
        <View key={name} style={styles.group}>
          <Text accessibilityRole="header" style={styles.heading}>
            {heading}
          </Text>
          <View accessibilityRole="list" accessibilityLabel={heading}>
            {paths.map((path) => (
              <FileRow
                key={path}
                path={path}
                open={isOpen(open, name, path)}
                onPress={() => onOpen({ group: name, path })}
                styles={styles}
              />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
