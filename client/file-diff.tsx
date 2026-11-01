import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { diffRpc } from "../shared/diff";
import { groups } from "./groups";
import type { OpenFile } from "./groups";
import { labelOf } from "./labels";
import { numberLines } from "./lines";
import type { NumberedLine } from "./lines";
import { Queried } from "./queried";

type Diff = RpcOutput<typeof diffRpc>;

// Paseo's own monospace fonts.
const monospace =
  "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

function useStyles(theme: PluginTheme) {
  return useMemo(
    () =>
      StyleSheet.create({
        file: { flex: 1 },
        fileBar: {
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "baseline",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 6,
          backgroundColor: theme.colors.accent,
        },
        status: { fontSize: 11, fontWeight: "700", color: theme.colors.accentForeground },
        barPath: { flexShrink: 1, fontSize: 13, color: theme.colors.accentForeground },
        label: { padding: 16, color: theme.colors.foregroundMuted },
        hunkBar: { height: 6, marginTop: 8, backgroundColor: theme.colors.accent, opacity: 0.4 },
        line: { flexDirection: "row" },
        // Under a line, tinting it as removed or added.
        tint: { ...StyleSheet.absoluteFillObject, opacity: 0.15 },
        context: { backgroundColor: "transparent" },
        removed: { backgroundColor: theme.colors.statusDanger },
        added: { backgroundColor: theme.colors.statusSuccess },
        number: {
          width: 44,
          paddingRight: 8,
          textAlign: "right",
          fontFamily: monospace,
          fontSize: 12,
          lineHeight: 18,
          color: theme.colors.foregroundMuted,
        },
        text: {
          flex: 1,
          paddingHorizontal: 8,
          fontFamily: monospace,
          fontSize: 12,
          lineHeight: 18,
          color: theme.colors.foreground,
        },
        noNewline: {
          paddingLeft: 96,
          fontSize: 11,
          lineHeight: 18,
          color: theme.colors.foregroundMuted,
        },
      }),
    [theme],
  );
}

type Styles = ReturnType<typeof useStyles>;

interface DiffLineProps {
  line: NumberedLine;
  styles: Styles;
}

// Only the line's text can be selected, so copying a selection copies what the lines say.
function DiffLine({ line, styles }: DiffLineProps): ReactElement {
  return (
    <View>
      <View style={styles.line}>
        <View style={[styles.tint, styles[line.kind]]} />
        <Text selectable={false} style={styles.number}>
          {line.oldNumber}
        </Text>
        <Text selectable={false} style={styles.number}>
          {line.newNumber}
        </Text>
        <Text selectable style={styles.text}>
          {line.text}
        </Text>
      </View>
      {line.newline ? null : (
        <Text selectable={false} style={styles.noNewline}>
          No newline at end of file
        </Text>
      )}
    </View>
  );
}

interface HunkProps {
  hunk: Diff["hunks"][number];
  styles: Styles;
}

function Hunk({ hunk, styles }: HunkProps): ReactElement {
  return (
    <View>
      <View style={styles.hunkBar} />
      {numberLines(hunk).map((line) => (
        <DiffLine key={`${line.oldNumber},${line.newNumber}`} line={line} styles={styles} />
      ))}
    </View>
  );
}

interface DiffBodyProps {
  diff: Diff;
  styles: Styles;
}

function DiffBody({ diff, styles }: DiffBodyProps): ReactElement {
  const label = labelOf(diff);

  if (label !== undefined) {
    return <Text style={styles.label}>{label}</Text>;
  }

  return (
    <ScrollView>
      {diff.hunks.map((hunk) => (
        <Hunk key={`${hunk.oldStart},${hunk.newStart}`} hunk={hunk} styles={styles} />
      ))}
    </ScrollView>
  );
}

interface FileBarProps {
  status: string;
  path: string;
  renamedFrom: string | undefined;
  styles: Styles;
}

function FileBar({ status, path, renamedFrom, styles }: FileBarProps): ReactElement {
  return (
    <View accessibilityRole="header" style={styles.fileBar}>
      <Text style={styles.status}>{status}</Text>
      {renamedFrom === undefined ? null : <Text style={styles.barPath}>{renamedFrom} →</Text>}
      <Text style={styles.barPath}>{path}</Text>
    </View>
  );
}

interface FileDiffProps {
  directory: string;
  file: OpenFile;
  theme: PluginTheme;
}

// The file's diff, as opened from its group, under a bar that says which file it is.
export function FileDiff({ directory, file: { group, path }, theme }: FileDiffProps): ReactElement {
  const { status, side } = groups[group];
  const readDiff = useRpc(diffRpc);
  const styles = useStyles(theme);

  const diff = useQuery({
    queryKey: [directory, "diff", side, path],
    queryFn: async () => {
      const read = await readDiff({ directory, path, side });

      return read;
    },
  });

  return (
    <View style={styles.file}>
      <FileBar status={status} path={path} renamedFrom={diff.data?.renamedFrom} styles={styles} />
      <Queried query={diff} theme={theme}>
        {(data) => <DiffBody diff={data} styles={styles} />}
      </Queried>
    </View>
  );
}
