import type { PluginTheme } from "@getpaseo/plugin";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import {
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { StyleSheet, View } from "react-native";

import type { Controls } from "./actions";
import type { CopyItem } from "./copy";
import { FileMenu } from "./file-menu";
import { FilterInput } from "./filter-input";
import { KeyboardFocusContext } from "./focus";
import { GroupSection } from "./group-section";
import type { StopHandlers } from "./group-section";
import { listedBy, selectedTo } from "./groups";
import type { GroupName, Open, OpenFile, OpenFiles, SidebarGroup } from "./groups";
import type { IgnorePlace } from "./ignore";
import { IgnorePrompt } from "./ignore-prompt";
import type { Ignoring } from "./ignore-prompt";
import { useKeyUp } from "./keyboard";
import type { Point } from "./menu";
import { passing } from "./passing";
import type { Passing } from "./passing";
import { filterKey, headingKey, listed, rowKey, settledStop } from "./sidebar-keys";
import type { SidebarList } from "./sidebar-keys";
import { indexOfStop, sidebarStops } from "./sidebar-stops";
import { nothingFocused, useLatest } from "./web";

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
  // How many review comments are pending on each file's diff, by its key.
  pending: ReadonlyMap<string, number>;
  theme: PluginTheme;
}

type ListState = SidebarList &
  Pick<FileListProps, "collapsed"> & {
    onMenu: (file: OpenFile, point: Point) => void;
  };

// What the files' rows and the groups' headings hear things with, which acts on the groups and
// what's open as they are once one hears something, so it stays the same as they change, and a row
// renders again only once what it shows does. Holds the place in the sidebar of a row or heading an
// action runs from with focus in it, and once no action is running, moves focus, if nothing has
// focus, as once the row an action ran from is gone, to the row of the file the view moves on to,
// or else to the row or heading that takes its place.
function useStopHandlers(list: ListState, controls: Controls): StopHandlers {
  const focus = useContext(KeyboardFocusContext);
  const latest = useLatest(list);
  const held = useRef<number>(undefined);
  const busy = useSyncExternalStore(controls.subscribe, () => controls.state().busy);

  useLayoutEffect(() => {
    held.current = settledStop(held.current, { busy, unfocused: nothingFocused() }, list, focus);
  });

  return useMemo(
    () => ({
      onPress: (file, shift) => {
        const { open, onOpen } = latest.current;

        onOpen(shift ? selectedTo(open, file, listed(latest.current, file.group)) : file);
      },
      onRowKey: (command, row, repeat) =>
        rowKey(command, row, { list: latest.current, focus, controls, repeat }),
      onHeadingKey: (command, heading, repeat) =>
        headingKey(command, heading, { list: latest.current, focus, controls, repeat }),
      onMenu: (file, point) => {
        latest.current.onMenu(file, point);
      },
      onHold: (stop) => {
        const index = indexOfStop(latest.current.stops, stop);

        held.current = index === -1 ? undefined : index;
      },
    }),
    [focus, latest, controls],
  );
}

// How long after keys last move focus past a file it opens: longer than a key held down takes to
// press itself again.
const settling = 200;

// What opens files, as keys move focus through the rows at once, or while one is held down, once
// keys stop moving focus past them, with the latest `onOpen`.
function usePassing(onOpen: (open: OpenFile | OpenFiles) => void): Passing {
  const latest = useLatest(onOpen);

  const passes = useMemo(
    () =>
      passing((open) => {
        latest.current(open);
      }, settling),
    [latest],
  );

  useEffect(() => passes.dispose, [passes]);

  return passes;
}

// Has keys in the view of a file open the file the sidebar lists after it or before it.
function useListedFiles(list: ListState): void {
  const focus = useContext(KeyboardFocusContext);
  const latest = useLatest(list);

  useLayoutEffect(
    () =>
      focus.addListed({
        listed: (file, step) =>
          listedBy(latest.current.groups, latest.current.collapsed, file, step),
        open: (file) => {
          latest.current.onOpen(file);
        },
      }),
    [focus, latest],
  );
}

// The changed files, in their groups, under the filter they're listed by. Each file and group has
// its actions at the end of its row, shown while the pointer is over it or focus is in it, and
// always for the open file or group, or the file the selection reaches. A file's row opens its
// file, or if shift-clicked selects the files from the open one to it, and opens its menu when
// right-clicked. Keys move focus through the sidebar's headings and rows, opening each file they
// reach, or while one is held down, the file they stop at, once it's let go, and from a row into
// its file's diff. Shift+↑/↓ selects one more file or one fewer, and moves focus to the file the
// selection reaches. A place picked in an untracked file's menu asks for the rule ignoring it,
// where the menu was.
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
  pending,
  theme,
}: FileListProps): ReactElement {
  const [menu, setMenu] = useState<{ file: OpenFile; point: Point }>();
  const [prompt, setPrompt] = useState<{ path: string; place: IgnorePlace; point: Point }>();
  const focus = useContext(KeyboardFocusContext);
  const id = useId();
  const passes = usePassing(onOpen);

  const list: ListState = {
    groups,
    open,
    onOpen: passes.open,
    onPass: passes.pass,
    collapsed,
    stops: useMemo(() => sidebarStops(groups, collapsed), [groups, collapsed]),
    onMenu: (file, point) => {
      setMenu({ file, point });
    },
  };

  const stops = useStopHandlers(list, controls);

  useListedFiles(list);
  useKeyUp(id, passes.flush);

  return (
    <View nativeID={id} style={styles.fileList}>
      <FilterInput
        filter={filter}
        onFilter={onFilter}
        onKey={(command) => filterKey(command, { filter, onFilter }, list, focus)}
        theme={theme}
      />
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
            stops={stops}
            pending={pending}
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
