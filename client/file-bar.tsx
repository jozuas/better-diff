import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import type { ReactElement, RefObject } from "react";
import { useContext, useId, useLayoutEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { diffRpc } from "../shared/diff";
import { ActionButtons } from "./action-buttons";
import type { Controls } from "./actions";
import { barCommand, fileBarActions, fileBarKeys, shownBare } from "./bar-commands";
import { barLabel, countsOf } from "./counts";
import { fileBar, KeyboardFocusContext } from "./focus";
import { FontSizesContext } from "./fonts";
import { groups } from "./groups";
import type { OpenFile } from "./groups";
import { useBarFocus, useCommands } from "./keyboard";
import type { Bar } from "./shortcuts";
import { whileShown } from "./shown";
import { ShownDiffsContext, shownFileKey } from "./shown-diffs";
import { useInsetFocusRing, useLatest } from "./web";

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
        // Over the diff that follows it, so its buttons' shortcuts show over the diff.
        fileBar: { zIndex: 1, justifyContent: "center", backgroundColor: theme.colors.surface2 },
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
        // On the bar's right.
        controls: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: "auto" },
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

interface FileBarProps {
  file: OpenFile;
  // Its index among the view's files.
  index: number;
  // Undefined until it's read, or if it can't be.
  diff: Diff | undefined;
  // At least as tall as this, with what it shows in its middle.
  minHeight?: number;
  // Hears how tall what it shows is, whatever minHeight.
  onHeight?: (height: number) => void;
  // Called just before one of the file's actions runs.
  onRun?: () => void;
  // Scrolls the view to show the file's diff from its start.
  onShow: () => void;
  // Asks for a collapsed diff's lines.
  onExpand: () => void;
  controls: Controls;
  theme: PluginTheme;
}

// Lets the panel's keyboard focus move to the bar, and show its file with `onShow`, and once the
// file's diff shows without hunks, move on to it once an action is done.
function useFileFocus(
  { file, index, diff }: Pick<FileBarProps, "file" | "index" | "diff">,
  bar: RefObject<View | null>,
  onShow: () => void,
) {
  const focus = useContext(KeyboardFocusContext);
  const latest = useLatest(onShow);
  const { group, path } = file;
  const bare = shownBare(diff);

  useLayoutEffect(
    () =>
      focus.addStop({
        file: { group, path },
        at: [index, fileBar],
        focus: () => {
          bar.current?.focus();
        },
        show: () => {
          latest.current();
        },
        bare,
      }),
    [focus, group, path, index, bar, latest, bare],
  );
}

interface BarPathProps {
  file: OpenFile;
  diff: Diff | undefined;
  styles: Styles;
}

// The file's path, after the one it was renamed from, if it was.
function BarPath({ file, diff, styles }: BarPathProps): ReactElement {
  return (
    <>
      {diff?.renamedFrom === undefined ? null : (
        <Text style={styles.barPath}>{diff.renamedFrom} →</Text>
      )}
      <Text style={styles.barPath}>{file.path}</Text>
    </>
  );
}

interface FileActionsProps {
  // Undefined until the file's diff is read.
  bar: Bar | undefined;
  // Whether focus is on the file's bar itself, where Enter and Backspace press them.
  keyed: boolean;
  controls: Controls;
  theme: PluginTheme;
}

function FileActions({ bar, keyed, controls, theme }: FileActionsProps): ReactElement | null {
  return bar === undefined ? null : (
    <ActionButtons
      {...bar}
      level="file"
      place="bar"
      keyed={keyed}
      controls={controls}
      color={theme.colors.foreground}
      theme={theme}
    />
  );
}

// Which file a diff is of, as opened from its group, how many lines it adds and removes, and the
// actions on the file. The diff it's rendered with is the one shown. Keys move focus to the bar
// itself, and in it move focus on through the view's bars, or back to its file's row, run its
// file's actions, and show a collapsed diff's lines. Once an action runs with focus in it, focus
// moves on to the first hunk of the file that takes its place.
export function FileBar({
  file,
  index,
  diff,
  minHeight,
  onHeight,
  onRun,
  onShow,
  onExpand,
  controls,
  theme,
}: FileBarProps): ReactElement {
  const styles = useStyles(theme);
  const id = useId();
  const header = useRef<View>(null);
  const focus = useContext(KeyboardFocusContext);
  const { focused, onBar, handlers } = useBarFocus();

  const bar = fileBarActions(file, diff, () => {
    if (focused) {
      focus.hold([index, fileBar]);
    }

    onRun?.();
  });

  useShownDiff(file, diff);
  useFileFocus({ file, index, diff }, header, onShow);
  useInsetFocusRing(id);
  useCommands(id, "bar", (command, own) =>
    barCommand(command, own, fileBarKeys(file, index, { bar, diff }, onExpand), focus, controls),
  );

  const label = barLabel(groups[file.group].status, file.path, diff);

  return (
    <View
      ref={header}
      nativeID={id}
      tabIndex={-1}
      role="group"
      accessibilityLabel={label}
      style={[styles.fileBar, { minHeight }]}
      {...handlers}
    >
      <View
        accessibilityRole="header"
        accessibilityLabel={label}
        style={styles.barContent}
        onLayout={whileShown(({ height }) => {
          onHeight?.(height);
        })}
      >
        <Text style={styles.status}>{groups[file.group].status}</Text>
        <BarPath file={file} diff={diff} styles={styles} />
        <LineCounts diff={diff} styles={styles} />
        <View style={styles.controls}>
          <FileActions bar={bar} keyed={onBar} controls={controls} theme={theme} />
        </View>
      </View>
    </View>
  );
}
