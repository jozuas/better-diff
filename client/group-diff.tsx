import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import type { ReactElement } from "react";
import {
  memo,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
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
import { filesToRender, linesShown, stillRendered } from "./rendering";
import { fileId, rangeIn } from "./selection";
import { useSelectedLines } from "./text-selection";
import { KeptPlaceContext, scrollUpTo, stopScrollAnchoring, useSettledFocus } from "./web";
import type { Whitespace } from "./whitespace-switch";

type Diff = RpcOutput<typeof diffRpc>;

type GroupRead = RpcOutput<typeof groupRpc>;

type DiffQuery = UseQueryOptions<Diff, Error, Diff, (string | boolean)[]>;

type ShownDiffProps = Omit<DiffBodyProps, "diff" | "scrolls">;

interface ExpandedDiffProps extends ShownDiffProps {
  diff: UseQueryResult<Diff>;
}

function ExpandedDiff({ diff, theme, ...shown }: ExpandedDiffProps): ReactElement {
  return (
    <Queried query={diff} theme={theme}>
      {(data) => <DiffBody diff={data} scrolls={false} theme={theme} {...shown} />}
    </Queried>
  );
}

interface GroupFileDiffProps extends Omit<ShownDiffProps, "file" | "onExpand" | "entireQuery"> {
  group: GroupName;
  // The query of a file's diff with its lines, and with every line of the file where `entire` says.
  query: (file: OpenFile, entire: boolean) => DiffQuery;
  // The file as the group's read has it.
  read: GroupRead["files"][number];
  // Its diff read again with its lines, once they're asked for.
  expanded: UseQueryResult<Diff> | undefined;
  // Asks for the lines of the collapsed diff of the file at the path.
  onExpand: (path: string) => void;
}

// The file's diff as the group's read has it, or why it couldn't be read, or as read again with its
// lines once they're asked for.
function FileOfGroup({
  group,
  query,
  read,
  expanded,
  onExpand,
  theme,
  ...shown
}: GroupFileDiffProps): ReactElement {
  const file = useMemo(() => ({ group, path: read.path }), [group, read.path]);

  const expand = useCallback(() => {
    onExpand(read.path);
  }, [onExpand, read.path]);

  const entireQuery = query(file, true);

  if (expanded !== undefined) {
    return (
      <ExpandedDiff
        diff={expanded}
        file={file}
        entireQuery={entireQuery}
        onExpand={expand}
        theme={theme}
        {...shown}
      />
    );
  }

  if ("error" in read) {
    return <Failed message={read.error} theme={theme} />;
  }

  return (
    <DiffBody
      diff={read}
      file={file}
      scrolls={false}
      entireQuery={entireQuery}
      onExpand={expand}
      theme={theme}
      {...shown}
    />
  );
}

// Rendered again only once what it's rendered with changes, as the text selection reaching into the
// file or leaving it does, and not as it changes in the group's other files.
const GroupFileDiff = memo(FileOfGroup);

// How many lines the files whose diffs render at first show, as many as a tall view shows, and how
// many more those whose diffs render each time after that do.
const firstLines = 200;
const moreLines = 1000;

// How many of the files, from the first, have their diffs rendered: at first those whose lines fill
// the view, and then more each time the last are, in a transition that what the page hears comes
// before, so that the view shows the first files of a group of thousands of lines at once, and
// scrolls them and hears the pointer over them while it renders the others. Once files join or
// leave, those rendered still are, so that what the view shows below one that joins above stays.
function useRenderedFiles(files: GroupRead["files"]): number {
  const lines = useMemo(() => files.map(linesShown), [files]);

  const [rendered, setRendered] = useState(() => ({
    files,
    count: filesToRender(lines, 0, firstLines),
  }));

  if (rendered.files !== files) {
    setRendered({
      files,
      count: stillRendered(rendered.files, rendered.count, files),
    });
  }

  const { count } = rendered;

  useEffect(() => {
    if (count < lines.length) {
      startTransition(() => {
        setRendered({ files, count: filesToRender(lines, count, moreLines) });
      });
    }
  }, [files, lines, count]);

  return count;
}

// Has the view keep the place of the start of each file's diff, and settle, keeping its place,
// each time it renders, with whether an action is running.
function useKeptStarts(files: GroupRead["files"], view: string, busy: boolean): void {
  const kept = useContext(KeptPlaceContext);

  const starts = useMemo(
    () => new Map(files.map(({ path }, index) => [path, fileId(view, index)])),
    [files, view],
  );

  useLayoutEffect(() => {
    kept.showStarts(starts);
  }, [kept, starts]);

  useLayoutEffect(() => {
    kept.settle(busy);
  });
}

interface GroupFilesProps {
  read: GroupRead;
  // The id of the view they scroll in.
  view: string;
  // Whether they show the old versions' lines beside the new ones', rather than inline.
  sideBySide: boolean;
  // The query of a file's diff with its lines, though it would be collapsed, and with every line of
  // the file where `entire` says.
  expanded: (file: OpenFile, entire?: boolean) => DiffQuery;
  group: GroupName;
  // What the sidebar's files are filtered by.
  filter: string;
  whitespace: Whitespace;
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
  whitespace,
  controls,
  theme,
}: GroupFilesProps): ReactElement {
  const [expandedPaths, setExpandedPaths] = useState<string[]>([]);
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map());
  const files = useMemo(() => listedFiles(read, filter), [read, filter]);
  const rendered = useRenderedFiles(files);
  const shownExpanded = files.filter(({ path }) => expandedPaths.includes(path));

  const expandedDiffs = useQueries({
    queries: shownExpanded.map(({ path }) => expanded({ group, path })),
  });

  // The file's diff read again with its lines, once they're asked for.
  function expandedDiff(path: string): UseQueryResult<Diff> | undefined {
    return expandedDiffs[shownExpanded.findIndex((file) => file.path === path)];
  }

  // Each file's diff as shown: read again with its lines, once it is, or else as the group's read
  // has it.
  const shownDiffs = files.map((file) => expandedDiff(file.path)?.data ?? diffOf(file));

  const selection = useSelectedLines(view, (index) =>
    JSON.stringify([files[index]?.path, shownDiffs[index]?.version]),
  );

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

  useKeptStarts(files, view, controls.busy);
  useSettledFocus(controls.busy);

  const barHeight = tallest(
    heights,
    files.map(({ path }) => path),
  );

  const onHunkRun = useCallback(
    (top: string, hunkBarHeight: number) => {
      scrollUpTo(view, top, barHeight + hunkBarHeight);
    },
    [view, barHeight],
  );

  const onFileRun = useCallback(
    (index: number) => {
      scrollUpTo(view, fileId(view, index), barHeight);
    },
    [view, barHeight],
  );

  const onExpand = useCallback((path: string) => {
    setExpandedPaths((paths) => [...paths, path]);
  }, []);

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
              diff={shownDiffs[index]}
              minHeight={barHeight}
              onHeight={(height) => {
                setHeights((current) => measured(current, shown.path, height));
              }}
              onRun={() => {
                onFileRun(index);
              }}
              whitespace={whitespace}
              controls={controls}
              theme={theme}
            />,
            <View key={`diff ${shown.path}`}>
              <View nativeID={fileId(view, index)} />
              {index < rendered ? (
                <GroupFileDiff
                  group={group}
                  query={expanded}
                  read={shown}
                  expanded={expandedDiff(shown.path)}
                  view={view}
                  fileIndex={index}
                  selection={rangeIn(selection, index)}
                  sideBySide={sideBySide}
                  barsBelow={barHeight}
                  onHunkRun={onHunkRun}
                  onFileRun={onFileRun}
                  controls={controls}
                  onExpand={onExpand}
                  theme={theme}
                />
              ) : null}
            </View>,
          ];
        })
      )}
    </ScrollView>
  );
}

interface GroupDiffProps extends Omit<GroupFilesProps, "read" | "view" | "sideBySide"> {
  // The query of the group's files' diffs.
  query: UseQueryOptions<GroupRead, Error, GroupRead, (string | boolean)[]>;
  layout: Layout;
}

// The diffs of the files the group lists, one after another in one view, each under its file's
// bar, which stays at the top while the diff scrolls under it, until the next file's bar covers it,
// with each hunk's bar under it while the hunk's lines scroll under them both. The files' bars are
// as tall as the tallest, so none shows from under the one that covers it. A collapsed diff shows
// its lines once asked to, until another file or group is opened. Just before an action on a file
// or a hunk runs, the view scrolls up to its start if it's above, so what then takes its place
// shows from its start, and focus moves on to the hunk that takes the place of one an action ran
// on with focus in its bar.
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
