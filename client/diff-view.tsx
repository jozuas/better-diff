import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import { useSettings } from "@getpaseo/plugin/client";
import { Loading, useToast } from "@getpaseo/plugin/client/ui";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useContext, useMemo } from "react";
import { StyleSheet, Text } from "react-native";

import type { diffRpc, groupRpc } from "../shared/diff";
import { viewSettings } from "../shared/settings";
import type { Controls } from "./actions";
import { FileDiff } from "./file-diff";
import type { Layout } from "./file-diff";
import { FontSizesContext } from "./fonts";
import { GroupDiff } from "./group-diff";
import type { GroupName, OpenFile, OpenGroup } from "./groups";
import { viewSettingsOf } from "./settings";

type Diff = RpcOutput<typeof diffRpc>;

type GroupRead = RpcOutput<typeof groupRpc>;

// Whether diffs show side by side, as the host's settings say, and what toggles it. Undefined until
// the host says.
function useLayout(): Layout | undefined {
  const toast = useToast();
  const settings = viewSettingsOf(useSettings(viewSettings), toast.error);

  if (settings === undefined) {
    return undefined;
  }

  const { sideBySide } = settings.values;

  return {
    sideBySide,
    onToggleSideBySide: () => {
      void settings.change({ sideBySide: !sideBySide });
    },
  };
}

interface ShownDiffProps extends Layout {
  open: OpenFile | OpenGroup;
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

function ShownDiff({
  open,
  fileQuery,
  groupQuery,
  filter,
  sideBySide,
  onToggleSideBySide,
  controls,
  theme,
}: ShownDiffProps): ReactElement {
  const { group, path } = open;

  if (path === undefined) {
    return (
      <GroupDiff
        key={group}
        query={groupQuery(group)}
        expanded={(file) => fileQuery(file, true)}
        group={group}
        filter={filter}
        sideBySide={sideBySide}
        onToggleSideBySide={onToggleSideBySide}
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
      sideBySide={sideBySide}
      onToggleSideBySide={onToggleSideBySide}
      controls={controls}
      theme={theme}
    />
  );
}

interface DiffViewProps extends Omit<ShownDiffProps, keyof Layout | "open"> {
  open: OpenFile | OpenGroup | undefined;
  // What shows while nothing is open.
  placeholder: string;
}

// The open file's diff, or the diffs of the files the open group lists, shown as the host's
// settings say.
export function DiffView({ open, placeholder, ...shown }: DiffViewProps): ReactElement {
  const layout = useLayout();
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

  return layout === undefined ? <Loading /> : <ShownDiff open={open} {...layout} {...shown} />;
}
