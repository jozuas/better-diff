import type { PluginTheme, RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { PluginTab, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings, useWorkspace } from "@getpaseo/plugin/client";
import { Loading, useToast } from "@getpaseo/plugin/client/ui";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { changesRpc, releaseRpc, versionRpc, waitRpc } from "../shared/changes";
import {
  applyFileRpc,
  applyGroupRpc,
  applyLinesRpc,
  applyModeRpc,
  diffRpc,
  groupRpc,
} from "../shared/diff";
import { viewSettings } from "../shared/settings";
import type { ViewValues } from "../shared/settings";
import type { Controls } from "./actions";
import { apply, staleMessage } from "./apply";
import type { Server, Target } from "./apply";
import { confirmation } from "./confirmation";
import type { Layout } from "./diff-style";
import { DiffView } from "./diff-view";
import { fontSizes, FontSizesContext } from "./fonts";
import { firstFile, groups, openAfter, placeholder } from "./groups";
import type { GroupName, Open, OpenFile } from "./groups";
import { readAt, refreshOf, refreshOnChanges } from "./refresh";
import { viewSettingsOf } from "./settings";
import { ShownDiffsContext, shownFileKey } from "./shown-diffs";
import { Sidebar } from "./sidebar";
import { SyntaxColorsProvider } from "./syntax-colors";
import { clearSelection } from "./text-selection";
import { useLatest } from "./web";
import { useWindowFocus } from "./window-focus";

type Listed = RpcOutput<typeof changesRpc>;

type Diff = RpcOutput<typeof diffRpc>;

interface Request {
  operation: RpcInput<typeof applyFileRpc>["operation"];
  target: Target;
}

// The queries of a file's diff, as opened from its group, collapsed or not, with every line of the
// file or only what its hunks take, and of the diffs of all of a group's files or of those of them
// at the paths.
function useDiffQueries(directory: string) {
  const readDiff = useRpc(diffRpc);
  const readGroup = useRpc(groupRpc);

  return {
    groupQuery: (group: GroupName, paths?: readonly string[]) =>
      queryOptions({
        queryKey: [directory, "group", group, ...(paths ?? [])],
        queryFn: async () => {
          const read = await readGroup({ directory, group, paths });

          return read;
        },
      }),
    query: (file: OpenFile, expand: boolean, entire = false) =>
      queryOptions({
        queryKey: [directory, "diff", groups[file.group].side, file.path, expand, entire],
        queryFn: async () => {
          const read = await readDiff({
            directory,
            path: file.path,
            side: groups[file.group].side,
            expand,
            entire,
          });

          return read;
        },
      }),
  };
}

// Runs the actions the panel's buttons ask for, once confirmed where they ask for it, one at a time,
// on the diff `shownDiff` gives where they act on the one shown. After each, the page's selection
// is cleared, since what it selected may be gone, `onApplied` hears of it, and a refused one says
// why.
function useControls(
  directory: string,
  shownDiff: Server["shownDiff"],
  onApplied: () => Promise<void>,
): Controls {
  const toast = useToast();
  const [armed, setArmed] = useState<string>();
  const confirm = useMemo(() => confirmation(setArmed), []);

  const server: Server = {
    shownDiff,
    readDiff: useRpc(diffRpc),
    readGroup: useRpc(groupRpc),
    applyFile: useRpc(applyFileRpc),
    applyLines: useRpc(applyLinesRpc),
    applyMode: useRpc(applyModeRpc),
    applyGroup: useRpc(applyGroupRpc),
  };

  const run = useMutation({
    mutationFn: async ({ operation, target }: Request) => {
      const status = await apply(server, directory, operation, target);

      return status;
    },
    onSuccess: (status, { target }) => {
      if (status === "stale") {
        toast.show(staleMessage(target), { variant: "warning" });
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
    onSettled: async () => {
      clearSelection();
      await onApplied();
    },
  });

  useEffect(() => confirm.dispose, [confirm]);

  return {
    armed,
    busy: run.isPending,
    press: (button, action, target, onRun) => {
      confirm.press(button, action.confirmation !== undefined, () => {
        onRun?.();
        run.mutate({ operation: action.operation, target });
      });
    },
  };
}

// Shows the directory's changes as they are whenever they may have changed, as while an agent edits
// its files, once they're first read: from `from`, the version they were read at, undefined until
// they're read, or an empty one, which none is, if they couldn't be.
function useRefreshOnChanges(
  directory: string,
  from: string | undefined,
  refresh: (version: string) => Promise<void>,
): void {
  const wait = useRpc(waitRpc);
  const release = useRpc(releaseRpc);
  const first = useLatest(from);
  const read = from !== undefined;

  useEffect(() => {
    const stopping = new AbortController();

    if (read) {
      refreshOnChanges(
        {
          wait: async (input) => {
            const answer = await wait({ directory, ...input });

            return answer;
          },
          release: async (version) => {
            await release({ directory, version });
          },
        },
        refresh,
        first.current ?? "",
        stopping.signal,
      );
    }

    return () => {
      stopping.abort();
    };
  }, [directory, read, wait, release, refresh, first]);
}

// What's open, moved on from the open file whenever the changes are listed again and its group no
// longer lists it, as after an action on it or an agent's change: past a hunk acted on, the next
// one is where it was.
function useOpen(changes: Listed | undefined) {
  const [open, setOpen] = useState<Open>();
  const [listed, setListed] = useState(changes);

  if (changes !== listed) {
    setListed(changes);
    setOpen(openAfter(open, listed, changes));
  }

  return [open, setOpen] as const;
}

interface FontSizesProviderProps {
  settings: ViewValues;
  children: ReactNode;
}

// Gives what's in it the sizes the font size settings set.
function FontSizesProvider({ settings, children }: FontSizesProviderProps): ReactElement {
  const { panelFontSize, diffFontSize } = settings;

  const sizes = useMemo(
    () => fontSizes({ panelFontSize, diffFontSize }),
    [panelFontSize, diffFontSize],
  );

  return <FontSizesContext value={sizes}>{children}</FontSizesContext>;
}

// The settings once they're read.
function useViewValues(): ViewValues | undefined {
  const toast = useToast();

  return viewSettingsOf(useSettings(viewSettings), toast.error)?.values;
}

interface ChangesProps {
  directory: string;
  layout: Layout;
  tab: PluginTab;
  theme: PluginTheme;
}

function Changes({ directory, layout, tab, theme }: ChangesProps): ReactElement {
  const listChanges = useRpc(changesRpc);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");

  const changes = useQuery({
    queryKey: [directory, "changes"],
    queryFn: async () => {
      const listed = await listChanges({ directory });

      return listed;
    },
  });

  const [open, setOpen] = useOpen(changes.data);
  const [listed, setListed] = useState(false);

  if (!listed && changes.data !== undefined) {
    setListed(true);
    setOpen(firstFile(changes.data));
  }

  const [panelWidth, setPanelWidth] = useState(Number.POSITIVE_INFINITY);
  const shownDiffs = useMemo(() => new Map<string, Diff>(), []);
  const diffs = useDiffQueries(directory);
  const readVersion = useRpc(versionRpc);
  const refresh = useMemo(() => refreshOf(queryClient, directory), [queryClient, directory]);

  // The version of the changes now, if it can be found.
  async function versionNow(): Promise<string | undefined> {
    try {
      const { version } = await readVersion({ directory });

      return version;
    } catch {
      return undefined;
    }
  }

  // Shows the changes as they are now, unless what's shown was read since they were.
  async function refreshNow(): Promise<void> {
    try {
      await refresh(await versionNow());
    } catch {
      // What's shown says why it couldn't be read.
    }
  }

  const controls = useControls(directory, (file) => shownDiffs.get(shownFileKey(file)), refreshNow);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        panel: { flex: 1, flexDirection: "row", backgroundColor: theme.colors.surface0 },
        diff: { flex: 1 },
      }),
    [theme],
  );

  useRefreshOnChanges(directory, readAt(changes), refresh);

  // Switching back from an editor may have changed what nothing tells of a change to, such as a
  // file outside the worktree that git reads.
  useWindowFocus(() => {
    void refreshNow();
  });

  return (
    <View
      style={styles.panel}
      onLayout={(event) => {
        setPanelWidth(event.nativeEvent.layout.width);
      }}
    >
      <Sidebar
        directory={directory}
        changes={changes}
        open={open}
        onOpen={setOpen}
        filter={filter}
        onFilter={setFilter}
        controls={controls}
        panelWidth={panelWidth}
        tab={tab}
        theme={theme}
      />
      <View style={styles.diff}>
        <ShownDiffsContext value={shownDiffs}>
          <DiffView
            open={open}
            placeholder={placeholder(changes.data)}
            layout={layout}
            fileQuery={diffs.query}
            groupQuery={diffs.groupQuery}
            filter={filter}
            controls={controls}
            theme={theme}
          />
        </ShownDiffsContext>
      </View>
    </View>
  );
}

// The workspace's changed files, and the diff of the one opened, shown as the host's settings say
// once it says.
export function ChangesPanel({ workspaceId, tab, theme }: PluginWorkspacePanelProps): ReactElement {
  const directory = useWorkspace(workspaceId, (workspace) => workspace.directory);
  const settings = useViewValues();

  if (directory === null || settings === undefined) {
    return <Loading />;
  }

  return (
    <FontSizesProvider settings={settings}>
      <SyntaxColorsProvider theme={theme}>
        <Changes directory={directory} layout={settings} tab={tab} theme={theme} />
      </SyntaxColorsProvider>
    </FontSizesProvider>
  );
}
