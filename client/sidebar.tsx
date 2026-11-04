import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { copyText, useToast } from "@getpaseo/plugin/client/ui";
import { useMutation } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useId, useState } from "react";
import { View } from "react-native";

import type { changesRpc } from "../shared/changes";
import { contentsRpc } from "../shared/contents";
import type { Controls } from "./actions";
import { copy } from "./copy";
import type { CopyItem } from "./copy";
import { FileList } from "./file-list";
import { sidebarGroups } from "./groups";
import type { GroupName, Open } from "./groups";
import { Queried } from "./queried";
import { fileListWidth } from "./resize";
import { Separator } from "./separator";
import { fittingWidth } from "./web";

type Listed = RpcOutput<typeof changesRpc>;

// What the sidebar shows, which the panel keeps in its tab.
export interface SidebarState {
  open: Open | undefined;
  onOpen: (open: Open) => void;
  // What the files are filtered by.
  filter: string;
  onFilter: (filter: string) => void;
  // The groups whose files are hidden, and what collapses a group, or expands it if it's collapsed.
  collapsed: readonly GroupName[];
  onToggle: (group: GroupName) => void;
  // The file list's width as it was last let go of, and what hears it each time it's let go.
  width: number;
  onWidth: (width: number) => void;
}

// Copies what a file's menu item names of the file at the path, and says why where it copies
// nothing.
function useCopy(directory: string): (item: CopyItem, path: string) => void {
  const toast = useToast();
  const readContents = useRpc(contentsRpc);

  const run = useMutation({
    mutationFn: async ({ item, path }: { item: CopyItem; path: string }) => {
      const refused = await copy(item, directory, path, { readContents, write: copyText });

      return refused;
    },
    onSuccess: (refused) => {
      if (refused !== undefined) {
        toast.show(refused, { variant: "warning" });
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return (item, path) => {
    run.mutate({ item, path });
  };
}

// The file list's width, from the one kept, as its separator is dragged, or fit to what the list
// with the id shows, kept once it's let go, and no wider than the panel's width leaves room for.
function useFileListWidth(
  kept: number,
  onKept: (width: number) => void,
  id: string,
  panel: number,
) {
  const [wanted, setWanted] = useState(kept);

  function onResized(width: number): void {
    setWanted(fileListWidth(width, panel));
    onKept(fileListWidth(width, panel));
  }

  return {
    width: fileListWidth(wanted, panel),
    onResize: setWanted,
    onResized,
    onFit: () => {
      onResized(fittingWidth(id) ?? wanted);
    },
  };
}

interface SidebarProps extends SidebarState {
  directory: string;
  changes: UseQueryResult<Listed>;
  controls: Controls;
  // How wide the panel it's in is.
  panelWidth: number;
  theme: PluginTheme;
}

// The changed files, once they're listed, beside the separator that resizes their list.
export function Sidebar({
  directory,
  changes,
  open,
  onOpen,
  filter,
  onFilter,
  collapsed,
  onToggle,
  width: kept,
  onWidth,
  controls,
  panelWidth,
  theme,
}: SidebarProps): ReactElement {
  const fileList = useId();
  const onCopy = useCopy(directory);

  const { width, onResize, onResized, onFit } = useFileListWidth(
    kept,
    onWidth,
    fileList,
    panelWidth,
  );

  return (
    <>
      <View nativeID={fileList} style={{ width }}>
        <Queried query={changes} theme={theme}>
          {(data) => (
            <FileList
              groups={sidebarGroups(data, filter)}
              open={open}
              onOpen={onOpen}
              onOpenGroup={(group) => {
                onOpen({ group });
              }}
              filter={filter}
              onFilter={onFilter}
              collapsed={collapsed}
              onToggle={onToggle}
              controls={controls}
              onCopy={onCopy}
              theme={theme}
            />
          )}
        </Queried>
      </View>
      <Separator
        width={width}
        onResize={onResize}
        onResized={onResized}
        onFit={onFit}
        theme={theme}
      />
    </>
  );
}
