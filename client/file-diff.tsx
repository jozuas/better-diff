import type { PluginTheme, RpcInput, RpcOutput } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { applyFileRpc, applyLinesRpc, diffRpc } from "../shared/diff";
import { ActionButtons } from "./action-buttons";
import { fileActions } from "./actions";
import type { Controls, Target } from "./actions";
import { confirmation } from "./confirmation";
import { DiffBody } from "./diff-body";
import { groups } from "./groups";
import type { GroupName, OpenFile } from "./groups";
import { Queried } from "./queried";
import { clearSelection } from "./web";

type Diff = RpcOutput<typeof diffRpc>;

type Request = Target & Pick<RpcInput<typeof applyFileRpc>, "operation">;

const staleMessage =
  "The diff changed after it was shown, so nothing was done. It's been reloaded.";

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

// Runs the actions the diff's buttons ask for, once confirmed where they ask for it, one at a time.
// After each, the page's selection is cleared, since what it selected may be gone, `onApplied`
// hears of it, and a refused one says why.
function useControls(
  directory: string,
  file: OpenFile,
  onApplied: (file: OpenFile) => Promise<void>,
): Controls {
  const applyFile = useRpc(applyFileRpc);
  const applyLines = useRpc(applyLinesRpc);
  const toast = useToast();
  const [armed, setArmed] = useState<string>();
  const confirm = useMemo(() => confirmation(setArmed), []);

  const apply = useMutation({
    mutationFn: async ({ lines, ...action }: Request) => {
      const { path } = file;

      const { status } = await (lines === undefined
        ? applyFile({ directory, path, ...action })
        : applyLines({ directory, path, ...action, lines }));

      return status;
    },
    onSuccess: (status) => {
      if (status === "stale") {
        toast.show(staleMessage, { variant: "warning" });
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
    onSettled: async () => {
      clearSelection();
      await onApplied(file);
    },
  });

  useEffect(() => confirm.dispose, [confirm]);

  return {
    armed,
    busy: apply.isPending,
    press: (button, action, target, onRun) => {
      confirm.press(button, action.confirmation !== undefined, () => {
        onRun?.();
        apply.mutate({ operation: action.operation, ...target });
      });
    },
  };
}

interface FileActionsProps {
  // Undefined until it's read.
  diff: Diff | undefined;
  group: GroupName;
  controls: Controls;
  theme: PluginTheme;
}

function FileActions({ diff, group, controls, theme }: FileActionsProps): ReactElement | null {
  if (diff === undefined) {
    return null;
  }

  return (
    <ActionButtons
      actions={fileActions[group]}
      bar={`${diff.version}:file`}
      target={{ version: diff.version }}
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
  directory: string;
  file: OpenFile;
  theme: PluginTheme;
  // Hears of each action on the file, once it's done, refused or failed.
  onApplied: (file: OpenFile) => Promise<void>;
}

// The file's diff, as opened from its group, under a bar that says which file it is.
export function FileDiff({ directory, file, theme, onApplied }: FileDiffProps): ReactElement {
  const { group, path } = file;
  const { status, side } = groups[group];
  const readDiff = useRpc(diffRpc);
  const styles = useStyles(theme);
  const controls = useControls(directory, file, onApplied);

  const diff = useQuery({
    queryKey: [directory, "diff", side, path],
    queryFn: async () => {
      const read = await readDiff({ directory, path, side });

      return read;
    },
  });

  return (
    <View style={styles.file}>
      <FileBar status={status} path={path} renamedFrom={diff.data?.renamedFrom} styles={styles}>
        <FileActions diff={diff.data} group={group} controls={controls} theme={theme} />
      </FileBar>
      <Queried query={diff} theme={theme}>
        {(data) => <DiffBody diff={data} group={group} controls={controls} theme={theme} />}
      </Queried>
    </View>
  );
}
