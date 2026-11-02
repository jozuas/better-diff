import type { PluginTheme } from "@getpaseo/plugin";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import { useEffect, useId, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fileActions, groupActions } from "./actions";
import type { Controls } from "./actions";
import type { CopyItem } from "./copy";
import { FileMenu } from "./file-menu";
import { FilterInput } from "./filter-input";
import { isGroupOpen, groups as kinds, isOpen, isShown, toggled } from "./groups";
import type { GroupName, OpenFile, OpenGroup, SidebarGroup } from "./groups";
import type { Point } from "./menu";
import { lookOf } from "./reveal";
import { SidebarButtons } from "./sidebar-buttons";
import { onContextMenu } from "./web";

function useStyles(theme: PluginTheme) {
  return useMemo(
    () =>
      StyleSheet.create({
        fileList: { flex: 1 },
        list: { paddingVertical: 8 },
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
        turned: { transform: [{ rotate: "90deg" }] },
        headingButton: { flex: 1 },
        heading: {
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.5,
          color: theme.colors.foregroundMuted,
        },
        row: { paddingLeft: 16, paddingRight: 12, paddingVertical: 3 },
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
  // Whether its diff is shown, as it is while it's open or its group is.
  shown: boolean;
  onPress: () => void;
  // Hears where the row was right-clicked.
  onMenu: (point: Point) => void;
  controls: Controls;
  styles: Styles;
  theme: PluginTheme;
}

function FileRow({
  file,
  open,
  shown,
  onPress,
  onMenu,
  controls,
  styles,
  theme,
}: FileRowProps): ReactElement {
  const { revealed, reveal } = useReveal();
  const look = lookOf(open, revealed);
  const id = useId();

  useEffect(() => onContextMenu(id, onMenu), [id, onMenu]);

  return (
    <View role="listitem" nativeID={id}>
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
        target={{ file, shown }}
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
  open: boolean;
  onOpen: () => void;
  expanded: boolean;
  onToggle: () => void;
  controls: Controls;
  styles: Styles;
  theme: PluginTheme;
}

// The group's heading, which opens the group, after the triangle that collapses and expands it,
// with the actions on all its files while it lists them all.
function GroupHeading({
  group: { name, heading, files },
  open,
  onOpen,
  expanded,
  onToggle,
  controls,
  styles,
  theme,
}: GroupHeadingProps): ReactElement {
  const { revealed, reveal } = useReveal();
  const look = lookOf(open, revealed);

  return (
    <View>
      <Pressable tabIndex={-1} style={[styles.headingRow, styles[look]]} {...reveal}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={kinds[name].title}
          aria-expanded={expanded}
          style={styles.toggle}
          onPress={onToggle}
          {...reveal}
        >
          <View style={[styles.triangle, expanded && styles.turned]} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={heading}
          accessibilityState={{ selected: open }}
          style={styles.headingButton}
          onPress={onOpen}
          {...reveal}
        >
          <Text accessibilityRole="header" style={styles.heading}>
            {heading}
          </Text>
        </Pressable>
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
  open: OpenFile | OpenGroup | undefined;
  onOpen: (file: OpenFile) => void;
  onOpenGroup: (group: GroupName) => void;
  // What the groups' files are filtered by.
  filter: string;
  onFilter: (filter: string) => void;
  controls: Controls;
  // Copies what a file's menu item names of the file at the path.
  onCopy: (item: CopyItem, path: string) => void;
  theme: PluginTheme;
}

// The changed files, in their groups, under the filter they're listed by. Each file and group has
// its actions at the end of its row, shown while the pointer is over it or focus is in it, and
// always for the open file or group. A file's row opens its menu when right-clicked.
export function FileList({
  groups,
  open,
  onOpen,
  onOpenGroup,
  filter,
  onFilter,
  controls,
  onCopy,
  theme,
}: FileListProps): ReactElement {
  const styles = useStyles(theme);
  const [menu, setMenu] = useState<{ path: string; point: Point }>();
  const [collapsed, setCollapsed] = useState<GroupName[]>([]);

  return (
    <View style={styles.fileList}>
      <FilterInput filter={filter} onFilter={onFilter} theme={theme} />
      <ScrollView contentContainerStyle={styles.list}>
        {groups.map((group) => (
          <View key={group.name} style={styles.group}>
            <GroupHeading
              group={group}
              open={isGroupOpen(open, group.name)}
              onOpen={() => {
                onOpenGroup(group.name);
              }}
              expanded={!collapsed.includes(group.name)}
              onToggle={() => {
                setCollapsed((shown) => toggled(shown, group.name));
              }}
              controls={controls}
              styles={styles}
              theme={theme}
            />
            <View accessibilityRole="list" accessibilityLabel={group.heading}>
              {(collapsed.includes(group.name) ? [] : group.paths).map((path) => (
                <FileRow
                  key={path}
                  file={{ group: group.name, path }}
                  open={isOpen(open, group.name, path)}
                  shown={isShown(open, group.name, path)}
                  onPress={() => {
                    onOpen({ group: group.name, path });
                  }}
                  onMenu={(point) => {
                    setMenu({ path, point });
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
      {menu === undefined ? null : (
        <FileMenu
          path={menu.path}
          point={menu.point}
          onCopy={(item) => {
            onCopy(item, menu.path);
          }}
          onClose={() => {
            setMenu(undefined);
          }}
          theme={theme}
        />
      )}
    </View>
  );
}
