import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { keepPreviousData, queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { memo, useCallback, useContext, useEffect, useMemo } from "react";
import { StyleSheet, Text } from "react-native";

import { diffRpc, groupRpc } from "../shared/diff";
import type { Controls } from "./actions";
import type { Where } from "./apply";
import type { Layout } from "./diff-style";
import { FileDiff } from "./file-diff";
import { FontSizesContext } from "./fonts";
import { GroupDiff } from "./group-diff";
import { groups } from "./groups";
import type { GroupName, Open, OpenFile } from "./groups";
import type { Whitespace } from "./whitespace-switch";

type Diff = RpcOutput<typeof diffRpc>;

type GroupRead = RpcOutput<typeof groupRpc>;

// The queries of a file's diff, as opened from its group, collapsed or not, with every line of the
// file or only what its hunks take, and of the diffs of all of a group's files or of those of them
// at the paths, with whitespace changes hidden or not. What one read last stays shown while it
// reads another, as once whitespace changes are hidden or shown, but for every line of the file,
// which shows the hunks of the diff it was read with: only the hunks show until it's read.
function useDiffQueries({ directory, hideWhitespace }: Where) {
  const readDiff = useRpc(diffRpc);
  const readGroup = useRpc(groupRpc);

  return useMemo(
    () => ({
      groupQuery: (group: GroupName, paths?: readonly string[]) =>
        queryOptions({
          queryKey: [directory, "group", group, hideWhitespace, ...(paths ?? [])],
          queryFn: async () => {
            const read = await readGroup({ directory, group, paths, hideWhitespace });

            return read;
          },
          placeholderData: keepPreviousData,
        }),
      query: (file: OpenFile, expand: boolean, entire = false) =>
        queryOptions({
          queryKey: [
            directory,
            "diff",
            groups[file.group].side,
            file.path,
            expand,
            entire,
            hideWhitespace,
          ],
          queryFn: async () => {
            const read = await readDiff({
              directory,
              path: file.path,
              side: groups[file.group].side,
              expand,
              entire,
              hideWhitespace,
            });

            return read;
          },
          placeholderData: (previous) => (entire ? undefined : previous),
        }),
    }),
    [directory, hideWhitespace, readDiff, readGroup],
  );
}

interface ShownDiffProps {
  open: Open;
  layout: Layout;
  // The query of a file's diff, collapsed or not, and with every line of the file or not.
  fileQuery: (
    file: OpenFile,
    expand: boolean,
    entire?: boolean,
  ) => UseQueryOptions<Diff, Error, Diff, (string | boolean)[]>;
  // The query of the diffs of all of a group's files, or of those of them at the paths.
  groupQuery: (
    group: GroupName,
    paths?: readonly string[],
  ) => UseQueryOptions<GroupRead, Error, GroupRead, (string | boolean)[]>;
  // The file that opens once the open file leaves its group, if any.
  next: OpenFile | undefined;
  // What the sidebar's files are filtered by.
  filter: string;
  whitespace: Whitespace;
  controls: Controls;
  theme: PluginTheme;
}

interface ReadAheadProps {
  query: ShownDiffProps["fileQuery"];
  open: OpenFile;
  next: OpenFile | undefined;
}

// Reads the next file's diff, if there's one, as it first shows, once the open file's is read, so
// that it shows at once when the file opens, without slowing the open file's down. Read again only
// once a refresh has found it may have changed, and then once the open file's is read again.
function ReadAhead({ query, open, next }: ReadAheadProps): null {
  const queryClient = useQueryClient();
  const shown = useQuery({ ...query(open, false), enabled: false });
  const read = shown.isSuccess && !shown.isFetching;

  useEffect(() => {
    if (read && next !== undefined) {
      void queryClient.prefetchQuery({
        ...query(next, false),
        staleTime: Number.POSITIVE_INFINITY,
      });
    }
  }, [queryClient, query, read, next]);

  return null;
}

function ShownDiff({
  open,
  fileQuery,
  groupQuery,
  next,
  filter,
  layout,
  whitespace,
  controls,
  theme,
}: ShownDiffProps): ReactElement {
  const { group } = open;

  const expanded = useCallback(
    (file: OpenFile, entire?: boolean) => fileQuery(file, true, entire),
    [fileQuery],
  );

  if ("paths" in open) {
    // All of them, whatever the filter, as the open file shows.
    return (
      <GroupDiff
        key={`${group}:${JSON.stringify(open.paths)}`}
        query={groupQuery(group, open.paths)}
        expanded={expanded}
        group={group}
        filter=""
        layout={layout}
        whitespace={whitespace}
        controls={controls}
        theme={theme}
      />
    );
  }

  if (open.path === undefined) {
    return (
      <GroupDiff
        key={group}
        query={groupQuery(group)}
        expanded={expanded}
        group={group}
        filter={filter}
        layout={layout}
        whitespace={whitespace}
        controls={controls}
        theme={theme}
      />
    );
  }

  // The open file itself, the same while it stays open, so neither its diff nor its hunks' bars are
  // rendered again with each of the panel's renders.
  return (
    <>
      <FileDiff
        key={`${group}:${open.path}`}
        query={fileQuery}
        file={open}
        layout={layout}
        whitespace={whitespace}
        controls={controls}
        theme={theme}
      />
      <ReadAhead query={fileQuery} open={open} next={next} />
    </>
  );
}

interface DiffViewProps extends Omit<ShownDiffProps, "open" | "fileQuery" | "groupQuery"> {
  // The worktree's.
  directory: string;
  open: Open | undefined;
  // What shows while nothing is open.
  placeholder: string;
}

// The open file's diff, or the diffs of the files the open group lists or of the files selected,
// shown as the host's settings say, with whitespace changes hidden or not.
function ViewOfDiff({ directory, open, placeholder, ...shown }: DiffViewProps): ReactElement {
  const fonts = useContext(FontSizesContext);
  const diffs = useDiffQueries({ directory, hideWhitespace: shown.whitespace.hidden });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        hint: { padding: 16, fontSize: fonts.text, color: shown.theme.colors.foregroundMuted },
      }),
    [shown.theme, fonts],
  );

  if (open === undefined) {
    return <Text style={styles.hint}>{placeholder}</Text>;
  }

  return <ShownDiff open={open} fileQuery={diffs.query} groupQuery={diffs.groupQuery} {...shown} />;
}

// Rendered again only once what it's rendered with changes, and not each time the panel is, as for
// the sidebar's state or the panel's width.
export const DiffView = memo(ViewOfDiff);
