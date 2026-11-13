import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { View } from "react-native";

import type { Controls } from "./actions";
import { isGroupOpen, rowOpen } from "./groups";
import type { Open, Repositories, SidebarGroup } from "./groups";
import { pendingOn } from "./review-list";
import { FileRow, GroupHeading } from "./sidebar-rows";
import type { StopHandlers } from "./sidebar-rows";
import { useStyles } from "./sidebar-styles";

interface GroupSectionProps {
  group: SidebarGroup;
  // Its files that are submodules, or repositories inside the worktree.
  repositories: Repositories[SidebarGroup["name"]];
  open: Open | undefined;
  onOpenGroup: () => void;
  expanded: boolean;
  onToggle: () => void;
  // What its heading and its files' rows hear things with.
  stops: StopHandlers;
  // How many review comments are pending on each file's diff, by its key.
  pending: ReadonlyMap<string, number>;
  controls: Controls;
  theme: PluginTheme;
}

// The group's heading, and the rows of the files it lists while it's expanded.
export function GroupSection({
  group,
  repositories,
  open,
  onOpenGroup,
  expanded,
  onToggle,
  stops,
  pending,
  controls,
  theme,
}: GroupSectionProps): ReactElement {
  const styles = useStyles(theme);
  const kinds = new Map(repositories);

  return (
    <View style={styles.group}>
      <GroupHeading
        group={group}
        open={isGroupOpen(open, group.name)}
        onOpen={onOpenGroup}
        expanded={expanded}
        onToggle={onToggle}
        onHeadingKey={stops.onHeadingKey}
        onHold={stops.onHold}
        controls={controls}
        styles={styles}
        theme={theme}
      />
      <View accessibilityRole="list" accessibilityLabel={group.heading}>
        {(expanded ? group.paths : []).map((path) => (
          <FileRow
            key={path}
            group={group.name}
            path={path}
            kind={kinds.get(path)}
            pending={pendingOn(pending, { group: group.name, path })}
            open={rowOpen(open, group.name, path)}
            {...stops}
            controls={controls}
            styles={styles}
            theme={theme}
          />
        ))}
      </View>
    </View>
  );
}
