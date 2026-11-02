import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useMemo } from "react";
import { StyleSheet, Text } from "react-native";

import type { diffRpc, groupRpc } from "../shared/diff";
import type { Controls } from "./actions";
import { FileDiff } from "./file-diff";
import { GroupDiff } from "./group-diff";
import type { GroupName, OpenFile, OpenGroup } from "./groups";

type Diff = RpcOutput<typeof diffRpc>;

type GroupRead = RpcOutput<typeof groupRpc>;

interface DiffViewProps {
  open: OpenFile | OpenGroup | undefined;
  // What shows while nothing is open.
  placeholder: string;
  // The query of a file's diff, collapsed or not.
  fileQuery: (
    file: OpenFile,
    expand: boolean,
  ) => UseQueryOptions<Diff, Error, Diff, (string | boolean)[]>;
  // The query of the diffs of all of a group's files.
  groupQuery: (group: GroupName) => UseQueryOptions<GroupRead, Error, GroupRead, string[]>;
  // What the sidebar's files are filtered by.
  filter: string;
  controls: Controls;
  theme: PluginTheme;
}

// The open file's diff, or the diffs of the files the open group lists.
export function DiffView({
  open,
  placeholder,
  fileQuery,
  groupQuery,
  filter,
  controls,
  theme,
}: DiffViewProps): ReactElement {
  const styles = useMemo(
    () => StyleSheet.create({ hint: { padding: 16, color: theme.colors.foregroundMuted } }),
    [theme],
  );

  if (open === undefined) {
    return <Text style={styles.hint}>{placeholder}</Text>;
  }

  const { group, path } = open;

  if (path === undefined) {
    return (
      <GroupDiff
        key={group}
        query={groupQuery(group)}
        expanded={(file) => fileQuery(file, true)}
        group={group}
        filter={filter}
        controls={controls}
        theme={theme}
      />
    );
  }

  return (
    <FileDiff
      key={`${group}:${path}`}
      query={(expand) => fileQuery({ group, path }, expand)}
      file={{ group, path }}
      controls={controls}
      theme={theme}
    />
  );
}
