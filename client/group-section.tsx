import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement, Ref } from "react";
import { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { groupActions, rowActions } from "./actions";
import type { Controls, RowActions } from "./actions";
import { FileLabel } from "./file-label";
import { FontSizesContext } from "./fonts";
import {
  isGroupOpen,
  groups as kinds,
  isOpen,
  reachedFile,
  selectedBy,
  selectedTo,
} from "./groups";
import type { Open, OpenFile, OpenFiles, SidebarGroup } from "./groups";
import { Hoverable } from "./hoverable";
import type { Point } from "./menu";
import { lookOf } from "./reveal";
import { withShift } from "./shift";
import { SidebarButtons } from "./sidebar-buttons";
import { onContextMenu, onShiftArrow } from "./web";

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

interface FileRowProps {
  file: OpenFile;
  // Whether it's open, or one of the files selected.
  open: boolean;
  // Its actions, on it or on all the files selected.
  actions: RowActions;
  // Hears whether Shift was held.
  onPress: (shift: boolean) => void;
  // Hears 1 on Shift+↓ while focus is in the row, and -1 on Shift+↑.
  onStep: (step: 1 | -1) => void;
  // Hears where the row was right-clicked.
  onMenu: (point: Point) => void;
  // The row's button that opens the file, which focus moves to once Shift+↑/↓ reaches it.
  buttonRef: Ref<View>;
  controls: Controls;
  styles: Styles;
  theme: PluginTheme;
}

function FileRow({
  file,
  open,
  actions,
  onPress,
  onStep,
  onMenu,
  buttonRef,
  controls,
  styles,
  theme,
}: FileRowProps): ReactElement {
  const { revealed, reveal } = useReveal();
  const look = lookOf(open, revealed);
  const id = useId();

  useEffect(() => onContextMenu(id, onMenu), [id, onMenu]);
  useEffect(() => onShiftArrow(id, onStep), [id, onStep]);

  return (
    <View role="listitem" nativeID={id}>
      <Pressable
        ref={buttonRef}
        accessibilityRole="button"
        accessibilityLabel={file.path}
        accessibilityState={{ selected: open }}
        style={[styles.row, styles[look]]}
        onPress={(event) => {
          onPress(withShift(event));
        }}
        {...reveal}
      >
        <FileLabel path={file.path} style={[styles.path, look === "plain" && styles.dimmedPath]} />
      </Pressable>
      <SidebarButtons
        {...actions}
        look={look}
        background={styles[look]}
        controls={controls}
        reveal={reveal}
        theme={theme}
      />
    </View>
  );
}

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
  onOpen: (open: OpenFile | OpenFiles) => void;
  onOpenGroup: () => void;
  expanded: boolean;
  onToggle: () => void;
  // Hears where the file at the path was right-clicked.
  onMenu: (path: string, point: Point) => void;
  controls: Controls;
  theme: PluginTheme;
}

// The group's heading, and the rows of the files it lists while it's expanded. A file's row opens
// its file, or if shift-clicked selects the files from the open one to it. Shift+↑/↓ with focus in
// a row selects one more file or one fewer, and moves focus to the file the selection reaches.
export function GroupSection({
  group,
  open,
  onOpen,
  onOpenGroup,
  expanded,
  onToggle,
  onMenu,
  controls,
  theme,
}: GroupSectionProps): ReactElement {
  const styles = useStyles(theme);
  // The rows' buttons that open their files, by their paths.
  const buttons = useRef(new Map<string, View>());

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
        {(expanded ? group.paths : []).map((path) => {
          const file = { group: group.name, path };

          return (
            <FileRow
              key={path}
              file={file}
              open={isOpen(open, group.name, path)}
              actions={rowActions(open, file)}
              onPress={(shift) => {
                onOpen(shift ? selectedTo(open, file, group.paths) : file);
              }}
              onStep={(step) => {
                const selected = selectedBy(open, file, group.paths, step);
                const reached = reachedFile(selected);

                onOpen(selected);

                if (reached !== undefined) {
                  buttons.current.get(reached)?.focus();
                }
              }}
              onMenu={(point) => {
                onMenu(path, point);
              }}
              buttonRef={(button) => {
                if (button !== null) {
                  buttons.current.set(path, button);
                }

                return () => {
                  buttons.current.delete(path);
                };
              }}
              controls={controls}
              styles={styles}
              theme={theme}
            />
          );
        })}
      </View>
    </View>
  );
}
