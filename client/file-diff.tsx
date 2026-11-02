import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { diffRpc } from "../shared/diff";
import { ActionButtons } from "./action-buttons";
import { fileActions } from "./actions";
import type { Controls } from "./actions";
import { countsOf } from "./counts";
import { DiffBody } from "./diff-body";
import { groups } from "./groups";
import type { OpenFile } from "./groups";
import { Queried } from "./queried";

type Diff = RpcOutput<typeof diffRpc>;

function useStyles(theme: PluginTheme) {
  return useMemo(
    () =>
      StyleSheet.create({
        file: { flex: 1 },
        fileBar: {
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 6,
          backgroundColor: theme.colors.accent,
        },
        status: { fontSize: 11, fontWeight: "700", color: theme.colors.accentForeground },
        barPath: { flexShrink: 1, fontSize: 13, color: theme.colors.accentForeground },
        // On the page's own surface, since the bar's accent can be as green or red as the counts.
        counts: {
          paddingHorizontal: 6,
          borderRadius: 4,
          fontSize: 12,
          fontWeight: "600",
          backgroundColor: theme.colors.surface0,
        },
        added: { color: theme.colors.statusSuccess },
        removed: { color: theme.colors.statusDanger },
      }),
    [theme],
  );
}

type Styles = ReturnType<typeof useStyles>;

interface LineCountsProps {
  // Undefined until it's read.
  diff: Diff | undefined;
  styles: Styles;
}

function LineCounts({ diff, styles }: LineCountsProps): ReactElement | null {
  const counts = diff === undefined ? undefined : countsOf(diff);

  if (counts === undefined) {
    return null;
  }

  return (
    <Text style={styles.counts}>
      <Text style={styles.added}>{counts.added}</Text>{" "}
      <Text style={styles.removed}>{counts.removed}</Text>
    </Text>
  );
}

interface FileActionsProps {
  // Undefined until it's read.
  diff: Diff | undefined;
  file: OpenFile;
  controls: Controls;
  theme: PluginTheme;
}

function FileActions({ diff, file, controls, theme }: FileActionsProps): ReactElement | null {
  if (diff === undefined) {
    return null;
  }

  return (
    <ActionButtons
      actions={fileActions[file.group]}
      bar={`${diff.version}:file`}
      target={{ file, version: diff.version }}
      controls={controls}
      color={theme.colors.accentForeground}
      theme={theme}
    />
  );
}

interface FileBarProps {
  status: string;
  path: string;
  renamedFrom: string | undefined;
  styles: Styles;
  children: ReactNode;
}

function FileBar({ status, path, renamedFrom, styles, children }: FileBarProps): ReactElement {
  return (
    <View accessibilityRole="header" style={styles.fileBar}>
      <Text style={styles.status}>{status}</Text>
      {renamedFrom === undefined ? null : <Text style={styles.barPath}>{renamedFrom} →</Text>}
      <Text style={styles.barPath}>{path}</Text>
      {children}
    </View>
  );
}

interface FileDiffProps {
  // The query of its diff, collapsed or not.
  query: (expand: boolean) => UseQueryOptions<Diff, Error, Diff, (string | boolean)[]>;
  file: OpenFile;
  controls: Controls;
  theme: PluginTheme;
}

// The file's diff, as opened from its group, under a bar that says which file it is and how many
// lines it adds and removes. A collapsed diff shows its lines once asked to, until another file is
// opened.
export function FileDiff({ query, file, controls, theme }: FileDiffProps): ReactElement {
  const styles = useStyles(theme);
  const [expand, setExpand] = useState(false);
  const diff = useQuery(query(expand));

  return (
    <View style={styles.file}>
      <FileBar
        status={groups[file.group].status}
        path={file.path}
        renamedFrom={diff.data?.renamedFrom}
        styles={styles}
      >
        <LineCounts diff={diff.data} styles={styles} />
        <FileActions diff={diff.data} file={file} controls={controls} theme={theme} />
      </FileBar>
      <Queried query={diff} theme={theme}>
        {(data) => (
          <DiffBody
            diff={data}
            file={file}
            controls={controls}
            onExpand={() => {
              setExpand(true);
            }}
            theme={theme}
          />
        )}
      </Queried>
    </View>
  );
}
