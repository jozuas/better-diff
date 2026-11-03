import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import type { PluginTab } from "@getpaseo/plugin/client";
import { useRpc, useTabState } from "@getpaseo/plugin/client";
import { copyText, useToast } from "@getpaseo/plugin/client/ui";
import { useMutation } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useId, useState } from "react";
import { View } from "react-native";
import { z } from "zod";

import type { changesRpc } from "../shared/changes";
import { contentsRpc } from "../shared/contents";
import type { Controls } from "./actions";
import { copy } from "./copy";
import type { CopyItem } from "./copy";
import { FileList } from "./file-list";
import { sidebarGroups } from "./groups";
import type { Open } from "./groups";
import { Queried } from "./queried";
import { defaultWidth, fileListWidth } from "./resize";
import { Separator } from "./separator";
import { fittingWidth } from "./web";

// What the panel keeps of each tab across reloads.
const tabState = z.object({ fileListWidth: z.number() });

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

// The file list's width, as its separator is dragged, or fit to what the list with the id shows,
// kept for the tab once it's let go, and no wider than the panel's width leaves room for.
function useFileListWidth(tab: PluginTab, id: string, panel: number) {
  const [saved, save] = useTabState(tab, tabState, { fileListWidth: defaultWidth });
  const [wanted, setWanted] = useState(saved.fileListWidth);

  function onResized(width: number): void {
    setWanted(fileListWidth(width, panel));
    save({ fileListWidth: fileListWidth(width, panel) });
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

interface SidebarProps {
  directory: string;
  changes: UseQueryResult<RpcOutput<typeof changesRpc>>;
  open: Open | undefined;
  onOpen: (open: Open) => void;
  // What the files are filtered by.
  filter: string;
  onFilter: (filter: string) => void;
  controls: Controls;
  // How wide the panel it's in is.
  panelWidth: number;
  tab: PluginTab;
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
  controls,
  panelWidth,
  tab,
  theme,
}: SidebarProps): ReactElement {
  const fileList = useId();
  const { width, onResize, onResized, onFit } = useFileListWidth(tab, fileList, panelWidth);
  const onCopy = useCopy(directory);

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
