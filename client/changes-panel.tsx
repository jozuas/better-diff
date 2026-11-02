import type { PluginTheme, RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { PluginTab, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings, useTabState, useWorkspace } from "@getpaseo/plugin/client";
import { copyText, Loading, useToast } from "@getpaseo/plugin/client/ui";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { StyleSheet, View } from "react-native";
import { z } from "zod";

import { changesRpc } from "../shared/changes";
import { contentsRpc } from "../shared/contents";
import {
  applyFileRpc,
  applyGroupRpc,
  applyLinesRpc,
  applyModeRpc,
  diffRpc,
  groupRpc,
} from "../shared/diff";
import { viewSettings } from "../shared/settings";
import type { Controls } from "./actions";
import { apply, staleMessage } from "./apply";
import type { Server, Target } from "./apply";
import { confirmation } from "./confirmation";
import { copy } from "./copy";
import type { CopyItem } from "./copy";
import { DiffView } from "./diff-view";
import { FileList } from "./file-list";
import { fontSizes, FontSizesContext } from "./fonts";
import type { FontSizes } from "./fonts";
import { diffIn, groups, openAfter, placeholder, sidebarGroups } from "./groups";
import type { GroupName, OpenFile, OpenGroup } from "./groups";
import { Queried } from "./queried";
import { defaultWidth, fileListWidth } from "./resize";
import { Separator } from "./separator";
import { SyntaxColorsProvider } from "./syntax-colors";
import { clearSelection, fittingWidth, onWindowFocus } from "./web";

// What the panel keeps of each tab across reloads.
const tabState = z.object({ fileListWidth: z.number() });

type Diff = RpcOutput<typeof diffRpc>;

type GroupRead = RpcOutput<typeof groupRpc>;

interface Request {
  operation: RpcInput<typeof applyFileRpc>["operation"];
  target: Target;
}

// The queries of a file's diff, as opened from its group, collapsed or not, whose keys start with
// the file's, and of the diffs of all of a group's files.
function useDiffQueries(directory: string) {
  const readDiff = useRpc(diffRpc);
  const readGroup = useRpc(groupRpc);

  function fileKey({ group, path }: OpenFile): string[] {
    return [directory, "diff", groups[group].side, path];
  }

  function groupKey(group: GroupName): string[] {
    return [directory, "group", group];
  }

  return {
    fileKey,
    groupKey,
    groupQuery: (group: GroupName) =>
      queryOptions({
        queryKey: groupKey(group),
        queryFn: async () => {
          const read = await readGroup({ directory, group });

          return read;
        },
      }),
    query: (file: OpenFile, expand: boolean) =>
      queryOptions({
        queryKey: [...fileKey(file), expand],
        queryFn: async () => {
          const read = await readDiff({
            directory,
            path: file.path,
            side: groups[file.group].side,
            expand,
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

// Calls the latest `refresh` whenever the window regains focus, as on switching back from an
// editor.
function useRefreshOnFocus(refresh: () => Promise<void>): void {
  const latest = useRef(refresh);

  useEffect(() => {
    latest.current = refresh;
  });

  useEffect(() => onWindowFocus(() => void latest.current()), []);
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

// The sizes the font size settings set, or their defaults until they're read, or if they can't be.
function useSettingsFontSizes(): FontSizes {
  const settings = useSettings(viewSettings);

  const { panelFontSize, diffFontSize } =
    settings.status === "ready" ? settings.values : viewSettings.schema.parse({});

  return useMemo(() => fontSizes({ panelFontSize, diffFontSize }), [panelFontSize, diffFontSize]);
}

interface ChangesProps {
  directory: string;
  tab: PluginTab;
  theme: PluginTheme;
}

function Changes({ directory, tab, theme }: ChangesProps): ReactElement {
  const listChanges = useRpc(changesRpc);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<OpenFile | OpenGroup>();
  const [filter, setFilter] = useState("");

  const changesQuery = queryOptions({
    queryKey: [directory, "changes"],
    queryFn: async () => {
      const listed = await listChanges({ directory });

      return listed;
    },
  });

  const changes = useQuery(changesQuery);
  const diffs = useDiffQueries(directory);
  const fileList = useId();
  const { width, onLayout, onResize, onResized, onFit } = useFileListWidth(tab, fileList);

  // Reads everything again, and moves on from the open file once its group no longer lists it, as
  // after an action on it: past a hunk acted on, the next one is where it was.
  async function refresh(): Promise<void> {
    const before = queryClient.getQueryData(changesQuery.queryKey);

    await queryClient.invalidateQueries({ queryKey: [directory] });

    const after = queryClient.getQueryData(changesQuery.queryKey);

    setOpen((shown) => openAfter(shown, before, after));
  }

  // The file's diff as its group's diffs show it, while they're shown.
  function groupShown(file: OpenFile): Diff | undefined {
    const [shown] = queryClient.getQueriesData<GroupRead>({
      queryKey: diffs.groupKey(file.group),
      type: "active",
    });

    return diffIn(shown?.[1], file.path);
  }

  const controls = useControls(
    directory,
    // The one of the file's queries the diff shown watches, or else its group's.
    (file) =>
      queryClient.getQueriesData<Diff>({ queryKey: diffs.fileKey(file), type: "active" })[0]?.[1] ??
      groupShown(file),
    refresh,
  );

  const onCopy = useCopy(directory);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        panel: { flex: 1, flexDirection: "row", backgroundColor: theme.colors.surface0 },
        diff: { flex: 1 },
      }),
    [theme],
  );

  useRefreshOnFocus(refresh);

  return (
    <View style={styles.panel} onLayout={onLayout}>
      <View nativeID={fileList} style={{ width }}>
        <Queried query={changes} theme={theme}>
          {(data) => (
            <FileList
              groups={sidebarGroups(data, filter)}
              open={open}
              onOpen={setOpen}
              onOpenGroup={(group) => {
                setOpen({ group });
              }}
              filter={filter}
              onFilter={setFilter}
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
      <View style={styles.diff}>
        <DiffView
          open={open}
          placeholder={placeholder(changes.data)}
          fileQuery={diffs.query}
          groupQuery={diffs.groupQuery}
          filter={filter}
          controls={controls}
          theme={theme}
        />
      </View>
    </View>
  );
}

// The workspace's changed files, and the diff of the one opened.
export function ChangesPanel({ workspaceId, tab, theme }: PluginWorkspacePanelProps): ReactElement {
  const directory = useWorkspace(workspaceId, (workspace) => workspace.directory);
  const sizes = useSettingsFontSizes();

  if (directory === null) {
    return <Loading />;
  }

  return (
    <FontSizesContext value={sizes}>
      <SyntaxColorsProvider theme={theme}>
        <Changes directory={directory} tab={tab} theme={theme} />
      </SyntaxColorsProvider>
    </FontSizesContext>
  );
}
