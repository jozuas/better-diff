import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useContext, useEffect, useId, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { diffRpc, groupRpc } from "../shared/diff";
import type { Controls } from "./actions";
import { measured, tallest } from "./bar-heights";
import { DiffBody } from "./diff-body";
import type { DiffBodyProps } from "./diff-body";
import { DiffLayout } from "./diff-layout";
import type { Layout } from "./diff-style";
import { FileBar } from "./file-diff";
import { FontSizesContext } from "./fonts";
import { diffOf, listedFiles } from "./groups";
import type { GroupName, OpenFile } from "./groups";
import { Failed, Queried } from "./queried";
import { fileId, rangeIn } from "./selection";
import { scrollUpTo, stopScrollAnchoring, useSelectedLines } from "./web";

type Diff = RpcOutput<typeof diffRpc>;

type GroupRead = RpcOutput<typeof groupRpc>;

type DiffQuery = UseQueryOptions<Diff, Error, Diff, (string | boolean)[]>;

type ShownDiffProps = Omit<DiffBodyProps, "diff" | "scrolls">;

interface ExpandedDiffProps extends ShownDiffProps {
  query: DiffQuery;
}

function ExpandedDiff({ query, theme, ...shown }: ExpandedDiffProps): ReactElement {
  const diff = useQuery(query);

  return (
    <Queried query={diff} theme={theme}>
      {(data) => <DiffBody diff={data} scrolls={false} theme={theme} {...shown} />}
    </Queried>
  );
}

interface GroupFileDiffProps extends ShownDiffProps {
  // The file as the group's read has it.
  read: GroupRead["files"][number];
  // The query of its diff with its lines, once they're asked for.
  expanded: DiffQuery | undefined;
}

// The file's diff as the group's read has it, or why it couldn't be read, or as read again with its
// lines once they're asked for.
function GroupFileDiff({ read, expanded, theme, ...shown }: GroupFileDiffProps): ReactElement {
  if (expanded !== undefined) {
    return <ExpandedDiff query={expanded} theme={theme} {...shown} />;
  }

  if ("error" in read) {
    return <Failed message={read.error} theme={theme} />;
  }

  return <DiffBody diff={read} scrolls={false} theme={theme} {...shown} />;
}

interface GroupFilesProps {
  read: GroupRead;
  // The id of the view they scroll in.
  view: string;
  // Whether they show the old versions' lines beside the new ones', rather than inline.
  sideBySide: boolean;
  // The query of a file's diff with its lines, though it would be collapsed.
  expanded: (file: OpenFile) => DiffQuery;
  group: GroupName;
  // What the sidebar's files are filtered by.
  filter: string;
  controls: Controls;
  theme: PluginTheme;
}

function GroupFiles({
  read,
  view,
  sideBySide,
  expanded,
  group,
  filter,
  controls,
  theme,
}: GroupFilesProps): ReactElement {
  const selection = useSelectedLines(view);
  const [expandedPaths, setExpandedPaths] = useState<string[]>([]);
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map());

  const fonts = useContext(FontSizesContext);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        hint: { padding: 16, fontSize: fonts.text, color: theme.colors.foregroundMuted },
      }),
    [theme, fonts],
  );

  useEffect(() => {
    stopScrollAnchoring(view);
  }, [view]);

  const files = listedFiles(read, filter);

  const barHeight = tallest(
    heights,
    files.map(({ path }) => path),
  );

  return (
    <ScrollView nativeID={view} stickyHeaderIndices={files.map((_, index) => 2 * index)}>
      {files.length === 0 ? (
        <Text style={styles.hint}>No changes</Text>
      ) : (
        files.flatMap((shown, index) => {
          const file = { group, path: shown.path };

          return [
            <FileBar
              key={`bar ${shown.path}`}
              file={file}
              diff={diffOf(shown)}
              minHeight={barHeight}
              onHeight={(height) => {
                setHeights((current) => measured(current, shown.path, height));
              }}
              onRun={() => {
                scrollUpTo(view, fileId(view, index), barHeight);
              }}
              controls={controls}
              theme={theme}
            />,
            <View key={`diff ${shown.path}`}>
              <View nativeID={fileId(view, index)} />
              <GroupFileDiff
                read={shown}
                expanded={expandedPaths.includes(shown.path) ? expanded(file) : undefined}
                file={file}
                view={view}
                fileIndex={index}
                selection={rangeIn(selection, index)}
                sideBySide={sideBySide}
                onHunkRun={(top, hunkBarHeight) => {
                  scrollUpTo(view, top, barHeight + hunkBarHeight);
                }}
                controls={controls}
                onExpand={() => {
                  setExpandedPaths((paths) => [...paths, shown.path]);
                }}
                theme={theme}
              />
            </View>,
          ];
        })
      )}
    </ScrollView>
  );
}

interface GroupDiffProps extends Omit<GroupFilesProps, "read" | "view" | "sideBySide"> {
  // The query of the group's files' diffs.
  query: UseQueryOptions<GroupRead, Error, GroupRead, string[]>;
  layout: Layout;
}

// The diffs of the files the group lists, one after another in one view, each under its file's
// bar, which stays at the top while the diff scrolls under it, until the next file's bar covers it.
// The bars are as tall as the tallest, so none shows from under the one that covers it. A collapsed
// diff shows its lines once asked to, until another file or group is opened. Just before an action
// on a file or a hunk runs, the view scrolls up to its start if it's above, so what then takes its
// place shows from its start.
export function GroupDiff({ query, layout, theme, ...files }: GroupDiffProps): ReactElement {
  const read = useQuery(query);
  const view = useId();

  return (
    <DiffLayout layout={layout} view={view}>
      {(sideBySide) => (
        <Queried query={read} theme={theme}>
          {(data) => (
            <GroupFiles read={data} view={view} sideBySide={sideBySide} theme={theme} {...files} />
          )}
        </Queried>
      )}
    </DiffLayout>
  );
}
