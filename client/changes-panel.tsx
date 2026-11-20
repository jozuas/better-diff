import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import type { PluginTab } from "@getpaseo/plugin/client";
import { useRpc, useTabState } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/ui";
import { notifyManager, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useId, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { changesRpc, versionRpc } from "../shared/changes";
import { applyFileRpc, applyGroupRpc, applyLinesRpc, applyModeRpc, diffRpc } from "../shared/diff";
import type { Controls } from "./actions";
import type { Server, Where } from "./apply";
import { confirmation } from "./confirmation";
import { applyAndTell, controlsStore, runBusy } from "./controls";
import type { Layout } from "./diff-style";
import { DiffView } from "./diff-view";
import { DiffWithFind } from "./find-bar";
import { usePanelFind } from "./find-page";
import { KeyboardFocusContext, keyboardFocus } from "./focus";
import { fileAfter, openAfter, placeholder, toggled } from "./groups";
import type { Hidden, Open } from "./groups";
import { WithKeyStrip } from "./key-strip";
import { useFocusOnOpen, usePanelKeys } from "./keyboard";
import { readAt, refreshOf } from "./refresh";
import { requests } from "./requests";
import { ReviewProvider } from "./review";
import { pendingCounts } from "./review-list";
import { whileShown } from "./shown";
import { ShownDiffsContext, shownFileKey } from "./shown-diffs";
import { Sidebar } from "./sidebar";
import type { SidebarState } from "./sidebar";
import { startingTab, tabState } from "./tab-state";
import { clearSelection } from "./text-selection";
import { RefreshOnChanges } from "./watching";
import { useLatest } from "./web";
import { useWindowFocus } from "./window-focus";
import type { ReviewState } from "./workspace-review";

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

// What's open, from what the tab kept: once the changes are first listed, what's still open of it,
// or else the first file the sidebar lists, with what it hides hidden, and after that, moved on from
// the open file whenever the changes are listed again and its group no longer lists it, as after an
// action on it or an agent's change: past a hunk acted on, the next one is where it was.
function useOpen(kept: Open | undefined, changes: Listed | undefined, hidden: Hidden) {
  const [open, setOpen] = useState(kept);
  const [listed, setListed] = useState<Listed>();

  if (changes !== undefined && changes !== listed) {
    setListed(changes);
    setOpen(openAfter(open, listed, changes, hidden));
  }

  return [open, setOpen] as const;
}

// What the sidebar shows, with what changes it, as the tab kept it before Paseo reloaded, if it
// did, and kept in the tab whenever it changes, so that the tab shows it again once Paseo reloads.
function useKeptState(tab: PluginTab, changes: Listed | undefined) {
  const [kept, keep] = useTabState(tab, tabState, startingTab);
  const [filter, setFilter] = useState(kept.filter);
  const [collapsed, setCollapsed] = useState(kept.collapsed);
  const [open, setOpen] = useOpen(kept.open ?? undefined, changes, { filter, collapsed });
  const [width, setWidth] = useState(kept.fileListWidth);
  const latestKeep = useLatest(keep);

  useEffect(() => {
    latestKeep.current({ fileListWidth: width, open: open ?? null, collapsed, filter });
  }, [latestKeep, width, open, collapsed, filter]);

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

  return sidebar;
}

export interface ChangesProps {
  // The workspace's ID, whose agents review comments are sent to.
  workspace: string;
  directory: string;
  layout: Layout;
  // Whether diffs are read with whitespace changes hidden.
  hideWhitespace: boolean;
  // The review the workspace keeps, with what changes it.
  review: ReviewState;
  tab: PluginTab;
  theme: PluginTheme;
}

export function Changes({
  workspace,
  directory,
  layout,
  hideWhitespace,
  review,
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

  const sidebar = useKeptState(tab, changes.data);
  const pending = useMemo(() => pendingCounts(review.comments), [review.comments]);
  const [panelWidth, setPanelWidth] = useState(Number.POSITIVE_INFINITY);
  const shownDiffs = useMemo(() => new Map<string, Diff>(), []);
  const focus = useMemo(() => keyboardFocus(), []);
  const where = { directory, hideWhitespace };

  const { filter, collapsed } = sidebar;

  const next = useMemo(
    () => fileAfter(sidebar.open, { filter, collapsed }, changes.data),
    [sidebar.open, filter, collapsed, changes.data],
  );

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

  usePanelKeys(id, focus, controls, findBar.keys, sidebar.open);
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
        panel: { flex: 1, backgroundColor: theme.colors.surface0, outlineWidth: 0 },
        diff: { flex: 1 },
      }),
    [theme],
  );

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
      onLayout={whileShown(({ width }) => {
        setPanelWidth(width);
      })}
    >
      <RefreshOnChanges directory={directory} from={readAt(changes)} refresh={refresh} />
      <KeyboardFocusContext value={focus}>
        <WithKeyStrip panel={id} theme={theme}>
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
        </WithKeyStrip>
      </KeyboardFocusContext>
    </View>
  );
}
