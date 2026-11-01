import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginTab, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useRpc, useTabState, useWorkspace } from "@getpaseo/plugin/client";
import { Loading } from "@getpaseo/plugin/client/ui";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useId, useMemo, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { StyleSheet, Text, View } from "react-native";
import { z } from "zod";

import { changesRpc } from "../shared/changes";
import { FileDiff } from "./file-diff";
import { FileList } from "./file-list";
import { openAfter, placeholder, sidebarGroups } from "./groups";
import type { OpenFile } from "./groups";
import { Queried } from "./queried";
import { defaultWidth, fileListWidth } from "./resize";
import { Separator } from "./separator";
import { fittingWidth, onWindowFocus } from "./web";

// What the panel keeps of each tab across reloads.
const tabState = z.object({ fileListWidth: z.number() });

// Reads again all the panel shows of the directory whenever the window regains focus, as on
// switching back from an editor.
function useRefreshOnFocus(directory: string): void {
  const queryClient = useQueryClient();

  useEffect(
    () => onWindowFocus(() => void queryClient.invalidateQueries({ queryKey: [directory] })),
    [queryClient, directory],
  );
}

// The file list's width, as its separator is dragged, or fit to what the list with the id shows,
// kept for the tab once it's let go, and no wider than the panel leaves room for.
function useFileListWidth(tab: PluginTab, id: string) {
  const [saved, save] = useTabState(tab, tabState, { fileListWidth: defaultWidth });
  const [wanted, setWanted] = useState(saved.fileListWidth);
  const [panel, setPanel] = useState(Number.POSITIVE_INFINITY);

  function onResized(width: number): void {
    setWanted(fileListWidth(width, panel));
    save({ fileListWidth: fileListWidth(width, panel) });
  }

  return {
    width: fileListWidth(wanted, panel),
    onLayout: (event: LayoutChangeEvent) => {
      setPanel(event.nativeEvent.layout.width);
    },
    onResize: setWanted,
    onResized,
    onFit: () => {
      onResized(fittingWidth(id) ?? wanted);
    },
  };
}

interface ChangesProps {
  directory: string;
  tab: PluginTab;
  theme: PluginTheme;
}

function Changes({ directory, tab, theme }: ChangesProps): ReactElement {
  const listChanges = useRpc(changesRpc);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<OpenFile>();

  const changesQuery = queryOptions({
    queryKey: [directory, "changes"],
    queryFn: async () => {
      const listed = await listChanges({ directory });

      return listed;
    },
  });

  const changes = useQuery(changesQuery);
  const fileList = useId();
  const { width, onLayout, onResize, onResized, onFit } = useFileListWidth(tab, fileList);

  // Reads everything again after an action on the file, and moves on from it once it's left its
  // group: past the hunk acted on, the next one is where it was.
  async function moveOn(file: OpenFile): Promise<void> {
    const before = queryClient.getQueryData(changesQuery.queryKey);

    await queryClient.invalidateQueries({ queryKey: [directory] });
    setOpen(openAfter(file, before, queryClient.getQueryData(changesQuery.queryKey)));
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        panel: { flex: 1, flexDirection: "row", backgroundColor: theme.colors.surface0 },
        diff: { flex: 1 },
        hint: { padding: 16, color: theme.colors.foregroundMuted },
      }),
    [theme],
  );

  useRefreshOnFocus(directory);

  return (
    <View style={styles.panel} onLayout={onLayout}>
      <View nativeID={fileList} style={{ width }}>
        <Queried query={changes} theme={theme}>
          {(data) => (
            <FileList groups={sidebarGroups(data)} open={open} onOpen={setOpen} theme={theme} />
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
      <View style={styles.diff}>
        {open === undefined ? (
          <Text style={styles.hint}>{placeholder(changes.data)}</Text>
        ) : (
          <FileDiff
            key={`${open.group}:${open.path}`}
            directory={directory}
            file={open}
            theme={theme}
            onApplied={moveOn}
          />
        )}
      </View>
    </View>
  );
}

// The workspace's changed files, and the diff of the one opened.
export function ChangesPanel({ workspaceId, tab, theme }: PluginWorkspacePanelProps): ReactElement {
  const directory = useWorkspace(workspaceId, (workspace) => workspace.directory);

  if (directory === null) {
    return <Loading />;
  }

  return <Changes directory={directory} tab={tab} theme={theme} />;
}
