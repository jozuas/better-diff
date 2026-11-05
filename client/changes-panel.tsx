import type { PluginTheme, RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { PluginTab, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings, useTabState, useWorkspace } from "@getpaseo/plugin/client";
import { Loading, useToast } from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { changesRpc, releaseRpc, versionRpc, waitRpc } from "../shared/changes";
import { applyFileRpc, applyGroupRpc, applyLinesRpc, applyModeRpc, diffRpc } from "../shared/diff";
import { viewSettings } from "../shared/settings";
import type { ViewValues } from "../shared/settings";
import type { Controls } from "./actions";
import { apply, misalignedMessage, staleMessage } from "./apply";
import type { Server, Target, Where } from "./apply";
import { confirmation } from "./confirmation";
import type { Layout } from "./diff-style";
import { TabSizeContext } from "./diff-styles";
import { DiffView } from "./diff-view";
import { KeyboardFocusContext, keyboardFocus } from "./focus";
import { FontSizesProvider } from "./font-sizes";
import { fileAfter, openAfter, placeholder, toggled } from "./groups";
import type { Open } from "./groups";
import { readAt, refreshOf, refreshOnChanges } from "./refresh";
import { viewSettingsOf } from "./settings";
import { ShownDiffsContext, shownFileKey } from "./shown-diffs";
import { Sidebar } from "./sidebar";
import type { SidebarState } from "./sidebar";
import { SyntaxColorsProvider } from "./syntax-colors";
import { startingTab, tabState } from "./tab-state";
import { clearSelection } from "./text-selection";
import { useLatest } from "./web";
import { useWindowFocus } from "./window-focus";

type Listed = RpcOutput<typeof changesRpc>;

type Diff = RpcOutput<typeof diffRpc>;

interface Request {
  operation: RpcInput<typeof applyFileRpc>["operation"];
  target: Target;
}

// Runs the actions the panel's buttons ask for, once confirmed where they ask for it, one at a time,
// on the diff `shownDiff` gives where they act on the one shown, as read with whitespace changes
// hidden or not. After each, the page's selection is cleared, since what it selected may be gone,
// `onApplied` hears of it, and a refused one says why. The controls stay the same until another button is armed or an action starts or ends, so the
// bars rendered with them aren't rendered again with each of the panel's renders.
function useControls(
  where: Where,
  shownDiff: Server["shownDiff"],
  onApplied: () => Promise<void>,
): Controls {
  const toast = useToast();
  const [armed, setArmed] = useState<string>();
  const confirm = useMemo(() => confirmation(setArmed), []);

  const server: Server = {
    shownDiff,
    applyFile: useRpc(applyFileRpc),
    applyLines: useRpc(applyLinesRpc),
    applyMode: useRpc(applyModeRpc),
    applyGroup: useRpc(applyGroupRpc),
  };

  const { mutateAsync, isPending } = useMutation({
    mutationFn: async ({ operation, target }: Request) => {
      const status = await apply(server, where, operation, target);

      return status;
    },
    onSuccess: (status, { operation, target }) => {
      if (status === "stale") {
        toast.show(staleMessage(target), { variant: "warning" });
      }

      if (status === "misaligned") {
        toast.show(misalignedMessage(operation), { variant: "warning" });
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

  return useMemo(
    () => ({
      armed,
      busy: isPending,
      press: (button, action, target, onRun) => {
        confirm.press(button, action.confirmation !== undefined, async () => {
          onRun?.();
          await mutateAsync({ operation: action.operation, target });
        });
      },
    }),
    [armed, isPending, confirm, mutateAsync],
  );
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

// What's open, from what the tab kept: once the changes are first listed, what's still open of it,
// or else the first file listed, and after that, moved on from the open file whenever the changes
// are listed again and its group no longer lists it, as after an action on it or an agent's change:
// past a hunk acted on, the next one is where it was.
function useOpen(kept: Open | undefined, changes: Listed | undefined) {
  const [open, setOpen] = useState(kept);
  const [listed, setListed] = useState<Listed>();

  if (changes !== undefined && changes !== listed) {
    setListed(changes);
    setOpen(openAfter(open, listed, changes));
  }

  return [open, setOpen] as const;
}

// What the sidebar shows, as the tab kept it before Paseo reloaded, if it did, and kept in the tab
// whenever it changes, so that the tab shows it again once Paseo reloads.
function useSidebarState(tab: PluginTab, changes: Listed | undefined): SidebarState {
  const [kept, keep] = useTabState(tab, tabState, startingTab);
  const [open, setOpen] = useOpen(kept.open ?? undefined, changes);
  const [filter, setFilter] = useState(kept.filter);
  const [collapsed, setCollapsed] = useState(kept.collapsed);
  const [width, setWidth] = useState(kept.fileListWidth);
  const latestKeep = useLatest(keep);

  useEffect(() => {
    latestKeep.current({ fileListWidth: width, open: open ?? null, collapsed, filter });
  }, [latestKeep, width, open, collapsed, filter]);

  return {
    open,
    onOpen: setOpen,
    filter,
    onFilter: setFilter,
    collapsed,
    onToggle: (group) => {
      setCollapsed((current) => toggled(current, group));
    },
    width,
    onWidth: setWidth,
  };
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

  const changes = useQuery({
    queryKey: [directory, "changes"],
    queryFn: async () => {
      const listed = await listChanges({ directory });

      return listed;
    },
  });

  const sidebar = useSidebarState(tab, changes.data);
  const [panelWidth, setPanelWidth] = useState(Number.POSITIVE_INFINITY);
  const shownDiffs = useMemo(() => new Map<string, Diff>(), []);
  const focus = useMemo(() => keyboardFocus(), []);
  const [hideWhitespace, setHideWhitespace] = useState(false);
  const where = { directory, hideWhitespace };
  const next = useMemo(() => fileAfter(sidebar.open, changes.data), [sidebar.open, changes.data]);
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

  const controls = useControls(where, (file) => shownDiffs.get(shownFileKey(file)), refreshNow);

  const whitespace = useMemo(
    () => ({
      hidden: hideWhitespace,
      onToggle: () => {
        setHideWhitespace((hidden) => !hidden);
      },
    }),
    [hideWhitespace],
  );

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
      <KeyboardFocusContext value={focus}>
        <Sidebar
          {...sidebar}
          directory={directory}
          changes={changes}
          controls={controls}
          panelWidth={panelWidth}
          theme={theme}
        />
        <View style={styles.diff}>
          <ShownDiffsContext value={shownDiffs}>
            <DiffView
              open={sidebar.open}
              placeholder={placeholder(changes.data)}
              layout={layout}
              directory={directory}
              next={next}
              filter={sidebar.filter}
              whitespace={whitespace}
              controls={controls}
              theme={theme}
            />
          </ShownDiffsContext>
        </View>
      </KeyboardFocusContext>
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
      <TabSizeContext value={settings.tabSize}>
        <SyntaxColorsProvider theme={theme}>
          <Changes directory={directory} layout={settings} tab={tab} theme={theme} />
        </SyntaxColorsProvider>
      </TabSizeContext>
    </FontSizesProvider>
  );
}
