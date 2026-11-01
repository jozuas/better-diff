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
      }),
    [theme],
  );
}

type Styles = ReturnType<typeof useStyles>;

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

// The file's diff, as opened from its group, under a bar that says which file it is. A collapsed
// diff shows its lines once asked to, until another file is opened.
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
