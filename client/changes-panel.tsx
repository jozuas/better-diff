import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import type { PluginTab } from "@getpaseo/plugin/client";
import { useRpc, useTabState } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/ui";
import { notifyManager, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useId, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { changesRpc, releaseRpc, versionRpc, waitRpc } from "../shared/changes";
import { applyFileRpc, applyGroupRpc, applyLinesRpc, applyModeRpc, diffRpc } from "../shared/diff";
import type { Controls } from "./actions";
import type { Server, Where } from "./apply";
import type { ReviewComment } from "./comments";
import { confirmation } from "./confirmation";
import { applyAndTell, controlsStore, runBusy } from "./controls";
import type { Layout } from "./diff-style";
import { DiffView } from "./diff-view";
import { DiffWithFind } from "./find-bar";
import { usePanelFind } from "./find-page";
import { KeyboardFocusContext, keyboardFocus } from "./focus";
import { fileAfter, openAfter, placeholder, toggled } from "./groups";
import type { Open } from "./groups";
import { useFocusOnOpen, usePanelKeys } from "./keyboard";
import { readAt, refreshOf, refreshOnChanges } from "./refresh";
import { requests } from "./requests";
import { ReviewProvider } from "./review";
import { pendingCounts } from "./review-list";
import { ShownDiffsContext, shownFileKey } from "./shown-diffs";
import { Sidebar } from "./sidebar";
import type { SidebarState } from "./sidebar";
import { startingTab, tabState } from "./tab-state";
import { clearSelection } from "./text-selection";
import { useLatest } from "./web";
import { useWindowFocus } from "./window-focus";

type Listed = RpcOutput<typeof changesRpc>;

type Diff = RpcOutput<typeof diffRpc>;

// Runs the actions the panel's buttons ask for, once confirmed where they ask for it, one at a time,
// on the diff `shownDiff` gives where they act on the one shown, as read with whitespace changes
// hidden or not. After each, the page's selection is cleared, since what it selected may be gone,
// `onApplied` hears of it, and a refused one says why. The controls stay the same, and which button
// is armed, and whether an action is running, reach only the buttons and views they change, so the
// bars rendered with them aren't rendered again as a button is armed, an action starts or ends, or
// the panel renders.
function useControls(
  where: Where,
  shownDiff: Server["shownDiff"],
  onApplied: () => Promise<void>,
): Controls {
  const toast = useToast();
  const store = useMemo(() => controlsStore(), []);

  const confirm = useMemo(
    () =>
      confirmation((armed) => {
        store.update({ armed });
      }),
    [store],
  );

  const server: Server = {
    shownDiff,
    applyFile: useRpc(applyFileRpc),
    applyLines: useRpc(applyLinesRpc),
    applyMode: useRpc(applyModeRpc),
    applyGroup: useRpc(applyGroupRpc),
  };

  const latest = useLatest({ server, where, toast, onApplied });

  useEffect(() => confirm.dispose, [confirm]);

  return useMemo(
    () => ({
      state: store.state,
      subscribe: store.subscribe,
      press: (button, action, target, onRun) => {
        confirm.press(button, action.confirmation !== undefined, async () => {
          onRun?.();
          await runBusy(
            store,
            async () => {
              const now = latest.current;

              await applyAndTell(now.server, now.where, action.operation, target, {
                refused: (message) => {
                  now.toast.show(message, { variant: "warning" });
                },
                failed: now.toast.error,
              });
              clearSelection();
              await now.onApplied();
            },
            // After the queries read again tell the views, which they do a tick later.
            (callback) => {
              notifyManager.schedule(callback);
            },
          );
        });
      },
      cancel: confirm.cancel,
    }),
    [store, confirm, latest],
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

// What the sidebar shows, and the review comments pending and the message they're to be sent with,
// with what changes them, as the tab kept them before Paseo reloaded, if it did, and kept in the
// tab whenever they change, so that the tab shows them again once Paseo reloads.
function useKeptState(tab: PluginTab, changes: Listed | undefined) {
  const [kept, keep] = useTabState(tab, tabState, startingTab);
  const [open, setOpen] = useOpen(kept.open ?? undefined, changes);
  const [filter, setFilter] = useState(kept.filter);
  const [collapsed, setCollapsed] = useState(kept.collapsed);
  const [width, setWidth] = useState(kept.fileListWidth);
  const [comments, setComments] = useState<readonly ReviewComment[]>(kept.comments);
  const [message, setMessage] = useState(kept.message);
  const latestKeep = useLatest(keep);

  useEffect(() => {
    latestKeep.current({
      fileListWidth: width,
      open: open ?? null,
      collapsed,
      filter,
      comments: [...comments],
      message,
    });
  }, [latestKeep, width, open, collapsed, filter, comments, message]);

  const sidebar: SidebarState = {
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

  return { sidebar, review: { comments, onComments: setComments, message, onMessage: setMessage } };
}

export interface ChangesProps {
  // The workspace's ID, whose agents review comments are sent to.
  workspace: string;
  directory: string;
  layout: Layout;
  // Whether diffs are read with whitespace changes hidden.
  hideWhitespace: boolean;
  tab: PluginTab;
  theme: PluginTheme;
}

export function Changes({
  workspace,
  directory,
  layout,
  hideWhitespace,
  tab,
  theme,
}: ChangesProps): ReactElement {
  const listChanges = useRpc(changesRpc);
  const queryClient = useQueryClient();

  const changes = useQuery({
    queryKey: [directory, "changes"],
    queryFn: async () => {
      const listed = await listChanges({ directory });

      return listed;
    },
  });

  const { sidebar, review } = useKeptState(tab, changes.data);
  const pending = useMemo(() => pendingCounts(review.comments), [review.comments]);
  const [panelWidth, setPanelWidth] = useState(Number.POSITIVE_INFINITY);
  const shownDiffs = useMemo(() => new Map<string, Diff>(), []);
  const focus = useMemo(() => keyboardFocus(), []);
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

  const id = useId();
  const findBar = usePanelFind(id);

  usePanelKeys(id, focus, controls, findBar.keys);
  useFocusOnOpen(
    requests,
    { workspace, panel: id },
    focus,
    sidebar.open,
    changes.data !== undefined,
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        // It has focus after a click in it where nothing else takes it, so that keys pressed then
        // reach it, and shows it no more than the page does.
        panel: {
          flex: 1,
          flexDirection: "row",
          backgroundColor: theme.colors.surface0,
          outlineWidth: 0,
        },
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
      nativeID={id}
      tabIndex={-1}
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
          refresh={refreshNow}
          panelWidth={panelWidth}
          pending={pending}
          theme={theme}
        />
        <View style={styles.diff}>
          <ReviewProvider
            directory={directory}
            workspace={workspace}
            {...review}
            listed={changes.data}
            onOpen={sidebar.onOpen}
            hideWhitespace={hideWhitespace}
            tab={tab}
            theme={theme}
          >
            <DiffWithFind panelFind={findBar} theme={theme}>
              <ShownDiffsContext value={shownDiffs}>
                <DiffView
                  open={sidebar.open}
                  placeholder={placeholder(changes.data)}
                  layout={layout}
                  directory={directory}
                  next={next}
                  filter={sidebar.filter}
                  hideWhitespace={hideWhitespace}
                  controls={controls}
                  theme={theme}
                />
              </ShownDiffsContext>
            </DiffWithFind>
          </ReviewProvider>
        </View>
      </KeyboardFocusContext>
    </View>
  );
}
