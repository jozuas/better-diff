import type { PluginTheme } from "@getpaseo/plugin";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import { useContext, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { Controls } from "./actions";
import type { CopyItem } from "./copy";
import { FileMenu } from "./file-menu";
import { FilterInput } from "./filter-input";
import { KeyboardFocusContext } from "./focus";
import { GroupSection } from "./group-section";
import type { RowHandlers } from "./group-section";
import { listedBy, reachedFile, selectedBy, selectedTo } from "./groups";
import type { GroupName, Open, OpenFile, OpenFiles, SidebarGroup } from "./groups";
import type { IgnorePlace } from "./ignore";
import { IgnorePrompt } from "./ignore-prompt";
import type { Ignoring } from "./ignore-prompt";
import type { Point } from "./menu";
import { useLatest } from "./web";

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
  ignoring: Ignoring;
  theme: PluginTheme;
}

// What the files' rows hear things with, which acts on the groups and what's open as they are once a
// row hears something, so it stays the same as they change, and a row renders again only once what
// it shows does.
function useRowHandlers(
  list: Pick<FileListProps, "groups" | "open" | "onOpen" | "collapsed"> & {
    onMenu: (file: OpenFile, point: Point) => void;
  },
): RowHandlers {
  const focus = useContext(KeyboardFocusContext);
  const latest = useLatest(list);

  return useMemo(() => {
    // The files the sidebar lists of the group.
    function listed(group: GroupName): string[] {
      return latest.current.groups.find(({ name }) => name === group)?.paths ?? [];
    }

    return {
      onPress: (file, shift) => {
        const { open, onOpen } = latest.current;

        onOpen(shift ? selectedTo(open, file, listed(file.group)) : file);
      },
      onStep: (file, step) => {
        const { open, onOpen } = latest.current;
        const selected = selectedBy(open, file, listed(file.group), step);
        const reached = reachedFile(selected);

        onOpen(selected);

        if (reached !== undefined) {
          focus.toRow({ group: file.group, path: reached });
        }
      },
      onMove: (file, move) => {
        const { groups, collapsed, onOpen } = latest.current;

        if (move === "diff") {
          focus.toHunks(file);

          return;
        }

        const next = listedBy(groups, collapsed, file, move);

        if (next !== undefined) {
          onOpen(next);
          focus.toRow(next);
        }
      },
      onMenu: (file, point) => {
        latest.current.onMenu(file, point);
      },
    };
  }, [focus, latest]);
}

// The changed files, in their groups, under the filter they're listed by. Each file and group has
// its actions at the end of its row, shown while the pointer is over it or focus is in it, and
// always for the open file or group, or the files selected. A file's row opens its file, or if
// shift-clicked selects the files from the open one to it, and opens its menu when right-clicked.
// ↓ and ↑ with focus in a file's row open the next file listed or the one before, whichever group
// it's in, and focus moves along with them. Shift+↑/↓ selects one more file or one fewer, and moves
// focus to the file the selection reaches. → moves focus to the file's first hunk in the diff. A
// place picked in an untracked file's menu asks for the rule ignoring it, where the menu was.
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
  ignoring,
  theme,
}: FileListProps): ReactElement {
  const [menu, setMenu] = useState<{ file: OpenFile; point: Point }>();
  const [prompt, setPrompt] = useState<{ path: string; place: IgnorePlace; point: Point }>();

  const rows = useRowHandlers({
    groups,
    open,
    onOpen,
    collapsed,
    onMenu: (file, point) => {
      setMenu({ file, point });
    },
  });

  return (
    <View style={styles.fileList}>
      <FilterInput filter={filter} onFilter={onFilter} theme={theme} />
      <ScrollView contentContainerStyle={styles.list}>
        {groups.map((group) => (
          <GroupSection
            key={group.name}
            group={group}
            open={open}
            onOpenGroup={() => {
              onOpenGroup(group.name);
            }}
            expanded={!collapsed.includes(group.name)}
            onToggle={() => {
              onToggle(group.name);
            }}
            rows={rows}
            controls={controls}
            theme={theme}
          />
        ))}
      </ScrollView>
      {menu === undefined ? null : (
        <FileMenu
          file={menu.file}
          point={menu.point}
          onCopy={(item) => {
            onCopy(item, menu.file.path);
          }}
          ignoring={ignoring}
          onIgnore={(place) => {
            setPrompt({ path: menu.file.path, place, point: menu.point });
          }}
          onClose={() => {
            setMenu(undefined);
          }}
          theme={theme}
        />
      )}
      {prompt === undefined ? null : (
        <IgnorePrompt
          path={prompt.path}
          place={prompt.place}
          point={prompt.point}
          ignoring={ignoring}
          onClose={() => {
            setPrompt(undefined);
          }}
          theme={theme}
        />
      )}
    </View>
  );
}
