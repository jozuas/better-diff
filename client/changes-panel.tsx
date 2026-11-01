import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useRpc, useWorkspace } from "@getpaseo/plugin/client";
import { Loading } from "@getpaseo/plugin/client/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { changesRpc } from "../shared/changes";
import { FileDiff } from "./file-diff";
import { FileList } from "./file-list";
import { sidebarGroups } from "./groups";
import type { OpenFile } from "./groups";
import { Queried } from "./queried";
import { onWindowFocus } from "./web";

// Reads again all the panel shows of the directory whenever the window regains focus, as on
// switching back from an editor.
function useRefreshOnFocus(directory: string): void {
  const queryClient = useQueryClient();

  useEffect(
    () => onWindowFocus(() => void queryClient.invalidateQueries({ queryKey: [directory] })),
    [queryClient, directory],
  );
}

interface ChangesProps {
  directory: string;
  theme: PluginTheme;
}

function Changes({ directory, theme }: ChangesProps): ReactElement {
  const listChanges = useRpc(changesRpc);
  const [open, setOpen] = useState<OpenFile>();

  const changes = useQuery({
    queryKey: [directory, "changes"],
    queryFn: async () => {
      const listed = await listChanges({ directory });

      return listed;
    },
  });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        panel: { flex: 1, flexDirection: "row", backgroundColor: theme.colors.surface0 },
        sidebar: { width: 280, borderRightWidth: 1, borderRightColor: theme.colors.border },
        diff: { flex: 1 },
        hint: { padding: 16, color: theme.colors.foregroundMuted },
      }),
    [theme],
  );

  useRefreshOnFocus(directory);

  return (
    <View style={styles.panel}>
      <View style={styles.sidebar}>
        <Queried query={changes} theme={theme}>
          {(data) => (
            <FileList groups={sidebarGroups(data)} open={open} onOpen={setOpen} theme={theme} />
          )}
        </Queried>
      </View>
      <View style={styles.diff}>
        {open === undefined ? (
          <Text style={styles.hint}>Select a file to see its changes.</Text>
        ) : (
          <FileDiff directory={directory} file={open} theme={theme} />
        )}
      </View>
    </View>
  );
}

// The workspace's changed files, and the diff of the one opened.
export function ChangesPanel({ workspaceId, theme }: PluginWorkspacePanelProps): ReactElement {
  const directory = useWorkspace(workspaceId, (workspace) => workspace.directory);

  if (directory === null) {
    return <Loading />;
  }

  return <Changes directory={directory} theme={theme} />;
}
