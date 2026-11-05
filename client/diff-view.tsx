import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useContext, useEffect, useMemo } from "react";
import { StyleSheet, Text } from "react-native";

import type { diffRpc, groupRpc } from "../shared/diff";
import type { Controls } from "./actions";
import type { Layout } from "./diff-style";
import { FileDiff } from "./file-diff";
import { FontSizesContext } from "./fonts";
import { GroupDiff } from "./group-diff";
import type { GroupName, Open, OpenFile } from "./groups";

type Diff = RpcOutput<typeof diffRpc>;

type GroupRead = RpcOutput<typeof groupRpc>;

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
  ) => UseQueryOptions<GroupRead, Error, GroupRead, string[]>;
  // The file that opens once the open file leaves its group, if any.
  next: OpenFile | undefined;
  // What the sidebar's files are filtered by.
  filter: string;
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
  controls,
  theme,
}: ShownDiffProps): ReactElement {
  const { group, path } = open;

  if ("paths" in open) {
    // All of them, whatever the filter, as the open file shows.
    return (
      <GroupDiff
        key={`${group}:${JSON.stringify(open.paths)}`}
        query={groupQuery(group, open.paths)}
        expanded={(file, entire) => fileQuery(file, true, entire)}
        group={group}
        filter=""
        layout={layout}
        controls={controls}
        theme={theme}
      />
    );
  }

  if (path === undefined) {
    return (
      <GroupDiff
        key={group}
        query={groupQuery(group)}
        expanded={(file, entire) => fileQuery(file, true, entire)}
        group={group}
        filter={filter}
        layout={layout}
        controls={controls}
        theme={theme}
      />
    );
  }

  return (
    <>
      <FileDiff
        key={`${group}:${path}`}
        query={(expand, entire) => fileQuery({ group, path }, expand, entire)}
        file={{ group, path }}
        layout={layout}
        controls={controls}
        theme={theme}
      />
      <ReadAhead query={fileQuery} open={{ group, path }} next={next} />
    </>
  );
}

interface DiffViewProps extends Omit<ShownDiffProps, "open"> {
  open: Open | undefined;
  // What shows while nothing is open.
  placeholder: string;
}

// The open file's diff, or the diffs of the files the open group lists or of the files selected,
// shown as the host's settings say.
export function DiffView({ open, placeholder, ...shown }: DiffViewProps): ReactElement {
  const fonts = useContext(FontSizesContext);

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

  return <ShownDiff open={open} {...shown} />;
}
