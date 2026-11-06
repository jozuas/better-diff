import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { memo, useCallback, useContext, useId, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { groupActions, rowActions } from "./actions";
import type { Controls } from "./actions";
import { FileLabel } from "./file-label";
import { KeyboardFocusContext } from "./focus";
import { isGroupOpen, groups as kinds, isOpen, rowOpen } from "./groups";
import type { GroupName, Open, OpenFile, SidebarGroup } from "./groups";
import { Hoverable } from "./hoverable";
import { useCommands, useContextMenu } from "./keyboard";
import type { CommandIn } from "./keymap";
import type { Point } from "./menu";
import { lookOf } from "./reveal";
import { withShift } from "./shift";
import { SidebarButtons } from "./sidebar-buttons";
import { groupBar, rowBar } from "./sidebar-keys";
import type { HeadingKeys, RowKeys } from "./sidebar-keys";
import type { SidebarStop } from "./sidebar-stops";
import { useStyles } from "./sidebar-styles";
import type { SidebarStyles as Styles } from "./sidebar-styles";
import { pointUnder } from "./web";

// Whether the pointer is over a row or focus is in it, which reveals its buttons, and what hears
// each, for each of the row's pressables. The pointer leaves one before it enters the next, and a
// pressable inside another takes the pointer from it.
function useReveal() {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  return {
    revealed: hovered || focused,
    focused,
    reveal: {
      onHoverIn: () => {
        setHovered(true);
      },
      onHoverOut: () => {
        setHovered(false);
      },
      onFocus: () => {
        setFocused(true);
      },
      onBlur: () => {
        setFocused(false);
      },
    },
  };
}

// What the sidebar's rows and headings hear things with, each with the row's file or the heading's
// group.
export interface StopHandlers {
  // Hears whether Shift was held.
  onPress: (file: OpenFile, shift: boolean) => void;
  // Hear each command a key gives with focus in a file's row, or a group's heading, and whether the
  // key is held down, and say whether they did anything with it.
  onRowKey: (command: CommandIn<"row">, row: RowKeys, repeat: boolean) => boolean;
  onHeadingKey: (command: CommandIn<"heading">, heading: HeadingKeys, repeat: boolean) => boolean;
  // Hears where the row's menu opens, as where it was right-clicked.
  onMenu: (file: OpenFile, point: Point) => void;
  // Hears that an action runs from the row or heading while focus is in it.
  onHold: (stop: SidebarStop) => void;
}

interface FileRowProps extends Omit<StopHandlers, "onHeadingKey"> {
  group: GroupName;
  path: string;
  // What's open, as the row shows it.
  open: Open | undefined;
  controls: Controls;
  styles: Styles;
  theme: PluginTheme;
}

// The file's row, whose button opens the file. With focus in it, keys move focus on through the
// sidebar, and Shift+Enter and Shift+Backspace run the row's actions, as its buttons do.
function RowOfFile({
  group,
  path,
  open,
  onPress,
  onRowKey,
  onMenu,
  onHold,
  controls,
  styles,
  theme,
}: FileRowProps): ReactElement {
  const file = useMemo(() => ({ group, path }), [group, path]);
  const { revealed, focused, reveal } = useReveal();
  const opened = isOpen(open, group, path);
  const look = lookOf(opened, revealed);
  const id = useId();
  const focus = useContext(KeyboardFocusContext);
  const actions = rowActions(open, file);

  // The button that opens the file, which focus moves to once keys reach the row.
  const buttonRef = useCallback(
    (button: View | null) => (button === null ? undefined : focus.addRow(file, button)),
    [focus, file],
  );

  const bar = rowBar(actions, () => {
    if (focused) {
      onHold(file);
    }
  });

  useContextMenu(id, (point) => {
    onMenu(file, point);
  });
  useCommands(id, "row", (command, _own, repeat) =>
    onRowKey(
      command,
      {
        stop: file,
        bar,
        onMenu: () => {
          onMenu(file, pointUnder(id));
        },
      },
      repeat,
    ),
  );

  return (
    <View role="listitem" nativeID={id}>
      <Pressable
        ref={buttonRef}
        tabIndex={-1}
        accessibilityRole="button"
        accessibilityLabel={path}
        accessibilityState={{ selected: opened }}
        style={[styles.row, styles[look]]}
        onPress={(event) => {
          onPress(file, withShift(event));
        }}
        {...reveal}
      >
        <FileLabel path={path} style={[styles.path, look === "plain" && styles.dimmedPath]} />
      </Pressable>
      <SidebarButtons
        {...actions}
        place="row"
        onRun={bar.onRun}
        look={look}
        background={styles[look]}
        controls={controls}
        reveal={reveal}
        theme={theme}
      />
    </View>
  );
}

// Rendered again only once what it's rendered with changes, as once its file opens or the controls
// change, and not with each of the sidebar's renders, as with each key typed in the filter.
const FileRow = memo(RowOfFile);

interface GroupHeadingProps extends Pick<StopHandlers, "onHeadingKey" | "onHold"> {
  group: SidebarGroup;
  open: boolean;
  onOpen: () => void;
  expanded: boolean;
  onToggle: () => void;
  controls: Controls;
  styles: Styles;
  theme: PluginTheme;
}

// The group's heading, which opens the group, after the triangle that collapses and expands it,
// with the actions on all its files while it lists them all. With focus in it, keys move focus on
// through the sidebar, ← and → collapse and expand the group, → once it's expanded opens it with
// focus in its diff, and Shift+Enter and Shift+Backspace run its actions, as its buttons do.
function GroupHeading({
  group: { name, heading, files },
  open,
  onOpen,
  expanded,
  onToggle,
  onHeadingKey,
  onHold,
  controls,
  styles,
  theme,
}: GroupHeadingProps): ReactElement {
  const { revealed, focused, reveal } = useReveal();
  const look = lookOf(open, revealed);
  const id = useId();
  const focus = useContext(KeyboardFocusContext);

  // The button that opens the group, which focus moves to once keys reach the heading.
  const buttonRef = useCallback(
    (button: View | null) => (button === null ? undefined : focus.addHeading(name, button)),
    [focus, name],
  );

  const bar = groupBar(name, files, () => {
    if (focused) {
      onHold({ group: name });
    }
  });

  useCommands(id, "heading", (command, _own, repeat) =>
    onHeadingKey(command, { stop: { group: name }, bar, expanded, open, onToggle, onOpen }, repeat),
  );

  return (
    <View nativeID={id}>
      <Pressable tabIndex={-1} style={[styles.headingRow, styles[look]]} {...reveal}>
        <Hoverable
          accessibilityRole="button"
          accessibilityLabel={kinds[name].title}
          aria-expanded={expanded}
          style={styles.toggle}
          onPress={onToggle}
          {...reveal}
        >
          {({ hovered }) => (
            <View
              style={[
                styles.triangle,
                hovered && styles.hoveredTriangle,
                expanded && styles.turned,
              ]}
            />
          )}
        </Hoverable>
        <Pressable
          ref={buttonRef}
          tabIndex={-1}
          accessibilityRole="button"
          accessibilityLabel={heading}
          accessibilityState={{ selected: open }}
          style={styles.headingButton}
          onPress={onOpen}
          {...reveal}
        >
          <Text accessibilityRole="header" style={styles.heading}>
            {heading}
          </Text>
        </Pressable>
      </Pressable>
      {bar === undefined ? null : (
        <SidebarButtons
          actions={groupActions[name]}
          row={bar.bar}
          place="heading"
          target={bar.target}
          onRun={bar.onRun}
          look={look}
          background={styles[look]}
          controls={controls}
          reveal={reveal}
          theme={theme}
        />
      )}
    </View>
  );
}

interface GroupSectionProps {
  group: SidebarGroup;
  open: Open | undefined;
  onOpenGroup: () => void;
  expanded: boolean;
  onToggle: () => void;
  // What its heading and its files' rows hear things with.
  stops: StopHandlers;
  controls: Controls;
  theme: PluginTheme;
}

// The group's heading, and the rows of the files it lists while it's expanded.
export function GroupSection({
  group,
  open,
  onOpenGroup,
  expanded,
  onToggle,
  stops,
  controls,
  theme,
}: GroupSectionProps): ReactElement {
  const styles = useStyles(theme);

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
