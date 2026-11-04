import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useContext, useId, useLayoutEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { diffRpc } from "../shared/diff";
import { ActionButtons } from "./action-buttons";
import { fileActions } from "./actions";
import type { Controls } from "./actions";
import { countsOf } from "./counts";
import { DiffBody } from "./diff-body";
import { DiffLayout } from "./diff-layout";
import type { Layout } from "./diff-style";
import { FontSizesContext } from "./fonts";
import { groups } from "./groups";
import type { OpenFile } from "./groups";
import { Queried } from "./queried";
import { ShownDiffsContext, shownFileKey } from "./shown-diffs";
import { useSelectedLines } from "./text-selection";
import { scrollUpTo } from "./web";

type Diff = RpcOutput<typeof diffRpc>;

// Has the file's diff, once it's read, as shown while it's rendered.
function useShownDiff(file: OpenFile, diff: Diff | undefined): void {
  const shown = useContext(ShownDiffsContext);
  const key = shownFileKey(file);

  useLayoutEffect(() => {
    if (diff !== undefined) {
      shown.set(key, diff);
    }

    return () => {
      if (shown.get(key) === diff) {
        shown.delete(key);
      }
    };
  }, [shown, key, diff]);
}

function useStyles(theme: PluginTheme) {
  const fonts = useContext(FontSizesContext);

  return useMemo(
    () =>
      StyleSheet.create({
        file: { flex: 1 },
        fileBar: { justifyContent: "center", backgroundColor: theme.colors.surface2 },
        barContent: {
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 6,
        },
        status: { fontSize: fonts.label, fontWeight: "700", color: theme.colors.foregroundMuted },
        barPath: { flexShrink: 1, fontSize: fonts.text, color: theme.colors.foreground },
        counts: { fontSize: fonts.small, fontWeight: "600" },
        added: { color: theme.colors.statusSuccess },
        removed: { color: theme.colors.statusDanger },
      }),
    [theme, fonts],
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
  onRun: (() => void) | undefined;
  theme: PluginTheme;
}

function FileActions({
  diff,
  file,
  controls,
  onRun,
  theme,
}: FileActionsProps): ReactElement | null {
  if (diff === undefined) {
    return null;
  }

  return (
    <ActionButtons
      actions={fileActions[file.group]}
      bar={`${diff.version}:file`}
      target={{ file, version: diff.version }}
      controls={controls}
      onRun={onRun}
      color={theme.colors.foreground}
      theme={theme}
    />
  );
}

interface FileBarProps {
  file: OpenFile;
  // Undefined until it's read, or if it can't be.
  diff: Diff | undefined;
  // At least as tall as this, with what it shows in its middle.
  minHeight?: number;
  // Hears how tall what it shows is, whatever minHeight.
  onHeight?: (height: number) => void;
  // Called just before one of the file's actions runs.
  onRun?: () => void;
  controls: Controls;
  theme: PluginTheme;
}

// Which file a diff is of, as opened from its group, how many lines it adds and removes, and the
// actions on the file. The diff it's rendered with is the one shown.
export function FileBar({
  file,
  diff,
  minHeight,
  onHeight,
  onRun,
  controls,
  theme,
}: FileBarProps): ReactElement {
  const styles = useStyles(theme);

  useShownDiff(file, diff);

  return (
    <View accessibilityRole="header" style={[styles.fileBar, { minHeight }]}>
      <View
        style={styles.barContent}
        onLayout={(event) => {
          onHeight?.(event.nativeEvent.layout.height);
        }}
      >
        <Text style={styles.status}>{groups[file.group].status}</Text>
        {diff?.renamedFrom === undefined ? null : (
          <Text style={styles.barPath}>{diff.renamedFrom} →</Text>
        )}
        <Text style={styles.barPath}>{file.path}</Text>
        <LineCounts diff={diff} styles={styles} />
        <FileActions diff={diff} file={file} controls={controls} onRun={onRun} theme={theme} />
      </View>
    </View>
  );
}

interface FileDiffProps {
  // The query of its diff, collapsed or not.
  query: (expand: boolean) => UseQueryOptions<Diff, Error, Diff, (string | boolean)[]>;
  file: OpenFile;
  layout: Layout;
  controls: Controls;
  theme: PluginTheme;
}

// The file's diff, as opened from its group, under its bar. A collapsed diff shows its lines once
// asked to, until another file is opened. Just before an action on a hunk runs, the view scrolls up
// to the hunk's start if it's above, so the next hunk, which then takes its place, shows from its
// start.
export function FileDiff({ query, file, layout, controls, theme }: FileDiffProps): ReactElement {
  const styles = useStyles(theme);
  const view = useId();
  const [expand, setExpand] = useState(false);
  const diff = useQuery(query(expand));
  const selection = useSelectedLines(view, () => diff.data?.version);

  return (
    <View style={styles.file}>
      <FileBar file={file} diff={diff.data} controls={controls} theme={theme} />
      <DiffLayout layout={layout} view={view}>
        {(sideBySide) => (
          <Queried query={diff} theme={theme}>
            {(data) => (
              <DiffBody
                diff={data}
                file={file}
                view={view}
                fileIndex={0}
                selection={selection}
                scrolls
                sideBySide={sideBySide}
                onHunkRun={(top, barHeight) => {
                  scrollUpTo(view, top, barHeight);
                }}
                controls={controls}
                onExpand={() => {
                  setExpand(true);
                }}
                theme={theme}
              />
            )}
          </Queried>
        )}
      </DiffLayout>
    </View>
  );
}
