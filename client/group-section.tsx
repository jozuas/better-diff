import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { memo, useCallback, useContext, useId, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { groupActions, rowActions } from "./actions";
import type { Controls } from "./actions";
import { rowMove } from "./arrows";
import { FileLabel } from "./file-label";
import { KeyboardFocusContext } from "./focus";
import { FontSizesContext } from "./fonts";
import { isGroupOpen, groups as kinds, isOpen, rowOpen } from "./groups";
import type { GroupName, Open, OpenFile, SidebarGroup } from "./groups";
import { Hoverable } from "./hoverable";
import type { Point } from "./menu";
import { lookOf } from "./reveal";
import { shiftStep, withShift } from "./shift";
import { SidebarButtons } from "./sidebar-buttons";
import { useContextMenu, useKeys } from "./web";

function useStyles(theme: PluginTheme) {
  const fonts = useContext(FontSizesContext);

  return useMemo(
    () =>
      StyleSheet.create({
        group: { marginBottom: 12 },
        // Hovering it reveals its buttons, though it does nothing pressed.
        headingRow: {
          flexDirection: "row",
          alignItems: "center",
          paddingRight: 12,
          paddingVertical: 4,
          cursor: "auto",
        },
        // In the gutter left of the heading, which lines the heading up with the files under it.
        toggle: { width: 16, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
        // Drawn by its left border between transparent top and bottom ones, so it points right, and
        // down once turned.
        triangle: {
          borderTopWidth: 4,
          borderBottomWidth: 4,
          borderLeftWidth: 6,
          borderTopColor: "transparent",
          borderBottomColor: "transparent",
          borderLeftColor: theme.colors.foregroundMuted,
        },
        hoveredTriangle: { borderLeftColor: theme.colors.foreground },
        turned: { transform: [{ rotate: "90deg" }] },
        headingButton: { flex: 1 },
        heading: {
          fontSize: fonts.label,
          fontWeight: "600",
          letterSpacing: 0.5,
          color: theme.colors.foreground,
        },
        row: { paddingLeft: 16, paddingRight: 12, paddingVertical: 3 },
        path: { fontSize: fonts.text, color: theme.colors.foreground },
        // As Paseo's Changes tab dims a file's name while it isn't hovered or selected.
        dimmedPath: { opacity: 0.76 },
        plain: {},
        revealed: { backgroundColor: theme.colors.surface1 },
        open: { backgroundColor: theme.colors.surface2 },
      }),
    [theme, fonts],
  );
}

type Styles = ReturnType<typeof useStyles>;

// Whether the pointer is over a row or focus is in it, which reveals its buttons, and what hears
// each, for each of the row's pressables. The pointer leaves one before it enters the next, and a
// pressable inside another takes the pointer from it.
function useReveal() {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  return {
    revealed: hovered || focused,
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

// What a file's row hears things with, each with the row's file.
export interface RowHandlers {
  // Hears whether Shift was held.
  onPress: (file: OpenFile, shift: boolean) => void;
  // Hears 1 on Shift+↓ while focus is in the row, and -1 on Shift+↑.
  onStep: (file: OpenFile, step: 1 | -1) => void;
  // Hears 1 on ↓ while focus is in the row, -1 on ↑, and "diff" on →.
  onMove: (file: OpenFile, move: 1 | -1 | "diff") => void;
  // Hears where the row was right-clicked.
  onMenu: (file: OpenFile, point: Point) => void;
}

interface FileRowProps extends RowHandlers {
  group: GroupName;
  path: string;
  // What's open, as the row shows it.
  open: Open | undefined;
  controls: Controls;
  styles: Styles;
  theme: PluginTheme;
}

function RowOfFile({
  group,
  path,
  open,
  onPress,
  onStep,
  onMove,
  onMenu,
  controls,
  styles,
  theme,
}: FileRowProps): ReactElement {
  const file = useMemo(() => ({ group, path }), [group, path]);
  const { revealed, reveal } = useReveal();
  const opened = isOpen(open, group, path);
  const look = lookOf(opened, revealed);
  const id = useId();
  const focus = useContext(KeyboardFocusContext);

  // The button that opens the file, which focus moves to once ↑/↓ reaches it.
  const buttonRef = useCallback(
    (button: View | null) => (button === null ? undefined : focus.addRow(file, button)),
    [focus, file],
  );

  useContextMenu(id, (point) => {
    onMenu(file, point);
  });
  useKeys(id, shiftStep, (step) => {
    onStep(file, step);
  });
  useKeys(id, rowMove, (move) => {
    onMove(file, move);
  });

  return (
    <View role="listitem" nativeID={id}>
      <Pressable
        ref={buttonRef}
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
        {...rowActions(open, file)}
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

interface GroupHeadingProps {
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
// with the actions on all its files while it lists them all.
function GroupHeading({
  group: { name, heading, files },
  open,
  onOpen,
  expanded,
  onToggle,
  controls,
  styles,
  theme,
}: GroupHeadingProps): ReactElement {
  const { revealed, reveal } = useReveal();
  const look = lookOf(open, revealed);

  return (
    <View>
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
      {files === undefined ? null : (
        <SidebarButtons
          actions={groupActions[name]}
          row={`group:${name}`}
          target={{ group: name, paths: files }}
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
  // What its files' rows hear things with.
  rows: RowHandlers;
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
  rows,
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
            {...rows}
            controls={controls}
            styles={styles}
            theme={theme}
          />
        ))}
      </View>
    </View>
  );
}
