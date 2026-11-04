import type { PluginTheme } from "@getpaseo/plugin";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import { useContext, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { Controls } from "./actions";
import type { CopyItem } from "./copy";
import { FileMenu } from "./file-menu";
import { FilterInput } from "./filter-input";
import { KeyboardFocusContext } from "./focus";
import { GroupSection } from "./group-section";
import { listedBy } from "./groups";
import type { GroupName, Open, OpenFile, OpenFiles, SidebarGroup } from "./groups";
import type { Point } from "./menu";

const styles = StyleSheet.create({
  fileList: { flex: 1 },
  list: { paddingVertical: 8 },
});

interface FileListProps {
  groups: SidebarGroup[];
  open: Open | undefined;
  onOpen: (open: OpenFile | OpenFiles) => void;
  onOpenGroup: (group: GroupName) => void;
  // What the groups' files are filtered by.
  filter: string;
  onFilter: (filter: string) => void;
  // The groups whose files are hidden, and what collapses a group, or expands it if it's collapsed.
  collapsed: readonly GroupName[];
  onToggle: (group: GroupName) => void;
  controls: Controls;
  // Copies what a file's menu item names of the file at the path.
  onCopy: (item: CopyItem, path: string) => void;
  theme: PluginTheme;
}

// The changed files, in their groups, under the filter they're listed by. Each file and group has
// its actions at the end of its row, shown while the pointer is over it or focus is in it, and
// always for the open file or group, or the files selected. A file's row opens its menu when
// right-clicked. ↓ and ↑ with focus in a file's row open the next file listed or the one before,
// whichever group it's in, and focus moves along with them.
export function FileList({
  groups,
  open,
  onOpen,
  onOpenGroup,
  filter,
  onFilter,
  collapsed,
  onToggle,
  controls,
  onCopy,
  theme,
}: FileListProps): ReactElement {
  const [menu, setMenu] = useState<{ path: string; point: Point }>();
  const focus = useContext(KeyboardFocusContext);

  return (
    <View style={styles.fileList}>
      <FilterInput filter={filter} onFilter={onFilter} theme={theme} />
      <ScrollView contentContainerStyle={styles.list}>
        {groups.map((group) => (
          <GroupSection
            key={group.name}
            group={group}
            open={open}
            onOpen={onOpen}
            onOpenGroup={() => {
              onOpenGroup(group.name);
            }}
            expanded={!collapsed.includes(group.name)}
            onToggle={() => {
              onToggle(group.name);
            }}
            onMove={(file, step) => {
              const next = listedBy(groups, collapsed, file, step);

              if (next !== undefined) {
                onOpen(next);
                focus.toRow(next);
              }
            }}
            onMenu={(path, point) => {
              setMenu({ path, point });
            }}
            controls={controls}
            theme={theme}
          />
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
