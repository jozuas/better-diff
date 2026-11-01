import type { PluginTheme } from "@getpaseo/plugin";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fileActions, groupActions } from "./actions";
import type { Controls } from "./actions";
import { FilterInput } from "./filter-input";
import { isOpen } from "./groups";
import type { OpenFile, SidebarGroup } from "./groups";
import { lookOf } from "./reveal";
import { SidebarButtons } from "./sidebar-buttons";

function useStyles(theme: PluginTheme) {
  return useMemo(
    () =>
      StyleSheet.create({
        fileList: { flex: 1 },
        list: { paddingVertical: 8 },
        group: { marginBottom: 12 },
        // Hovering it reveals its buttons, though it does nothing pressed.
        headingRow: { paddingHorizontal: 12, paddingVertical: 4, cursor: "auto" },
        heading: {
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.5,
          color: theme.colors.foregroundMuted,
        },
        row: { paddingHorizontal: 12, paddingVertical: 3 },
        path: { fontSize: 13, color: theme.colors.foreground },
        plain: {},
        revealed: { backgroundColor: theme.colors.surface1 },
        open: { backgroundColor: theme.colors.surface2 },
      }),
    [theme],
  );
}

type Styles = ReturnType<typeof useStyles>;

// Whether the pointer is over a row or focus is in it, which reveals its buttons, and what hears
// each, for each of the row's pressables. The pointer leaves one before it enters the next, and a
// pressable inside another takes the pointer from it.
function useReveal() {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  return {
    revealed: hovered || focused,
    reveal: {
      onHoverIn: () => {
        setHovered(true);
      },
      onHoverOut: () => {
        setHovered(false);
      },
      onFocus: () => {
        setFocused(true);
      },
      onBlur: () => {
        setFocused(false);
      },
    },
  };
}

interface FileRowProps {
  file: OpenFile;
  open: boolean;
  onPress: () => void;
  controls: Controls;
  styles: Styles;
  theme: PluginTheme;
}

function FileRow({ file, open, onPress, controls, styles, theme }: FileRowProps): ReactElement {
  const { revealed, reveal } = useReveal();
  const look = lookOf(open, revealed);

  return (
    <View role="listitem">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={file.path}
        accessibilityState={{ selected: open }}
        style={[styles.row, styles[look]]}
        onPress={onPress}
        {...reveal}
      >
        <Text numberOfLines={1} style={styles.path}>
          {file.path}
        </Text>
      </Pressable>
      <SidebarButtons
        actions={fileActions[file.group]}
        row={`file:${file.group}:${file.path}`}
        target={{ file, shown: open }}
        path={file.path}
        look={look}
        background={styles[look]}
        controls={controls}
        reveal={reveal}
        theme={theme}
      />
    </View>
  );
}

interface GroupHeadingProps {
  group: SidebarGroup;
  controls: Controls;
  styles: Styles;
  theme: PluginTheme;
}

// The group's heading, with the actions on all its files while it lists them all.
function GroupHeading({
  group: { name, heading, files },
  controls,
  styles,
  theme,
}: GroupHeadingProps): ReactElement {
  const { revealed, reveal } = useReveal();
  const look = lookOf(false, revealed);

  return (
    <View>
      <Pressable tabIndex={-1} style={[styles.headingRow, styles[look]]} {...reveal}>
        <Text accessibilityRole="header" style={styles.heading}>
          {heading}
        </Text>
      </Pressable>
      {files === undefined ? null : (
        <SidebarButtons
          actions={groupActions[name]}
          row={`group:${name}`}
          target={{ group: name, paths: files }}
          look={look}
          background={styles[look]}
          controls={controls}
          reveal={reveal}
          theme={theme}
        />
      )}
    </View>
  );
}

interface FileListProps {
  groups: SidebarGroup[];
  open: OpenFile | undefined;
  onOpen: (file: OpenFile) => void;
  // What the groups' files are filtered by.
  filter: string;
  onFilter: (filter: string) => void;
  controls: Controls;
  theme: PluginTheme;
}

// The changed files, in their groups, under the filter they're listed by. Each file and group has
// its actions at the end of its row, shown while the pointer is over it or focus is in it, and
// always for the open file.
export function FileList({
  groups,
  open,
  onOpen,
  filter,
  onFilter,
  controls,
  theme,
}: FileListProps): ReactElement {
  const styles = useStyles(theme);

  return (
    <View style={styles.fileList}>
      <FilterInput filter={filter} onFilter={onFilter} theme={theme} />
      <ScrollView contentContainerStyle={styles.list}>
        {groups.map((group) => (
          <View key={group.name} style={styles.group}>
            <GroupHeading group={group} controls={controls} styles={styles} theme={theme} />
            <View accessibilityRole="list" accessibilityLabel={group.heading}>
              {group.paths.map((path) => (
                <FileRow
                  key={path}
                  file={{ group: group.name, path }}
                  open={isOpen(open, group.name, path)}
                  onPress={() => {
                    onOpen({ group: group.name, path });
                  }}
                  controls={controls}
                  styles={styles}
                  theme={theme}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
