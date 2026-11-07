import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { ReactElement, ReactNode, Ref } from "react";
import { Fragment, useContext, useId, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { FontSizesContext } from "./fonts";
import { Hoverable } from "./hoverable";
import { useCommands, useContextMenu } from "./keyboard";
import { itemLook, menuPosition, menuStep } from "./menu";
import type { Point, Size } from "./menu";

function useStyles(theme: PluginTheme) {
  const fonts = useContext(FontSizesContext);

  return useMemo(
    () => ({
      ...StyleSheet.create({
        // Over the backdrop, which comes after it so that the modal's focus goes to its first item.
        popup: {
          position: "absolute",
          zIndex: 1,
          minWidth: 180,
          paddingVertical: 4,
          borderWidth: 1,
          borderRadius: 6,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
        },
        // Until it's measured, and so can be placed.
        unmeasured: { opacity: 0 },
        item: {
          flexDirection: "row",
          alignItems: "center",
          gap: fonts.fileIconGap,
          paddingHorizontal: 12,
          paddingVertical: 4,
        },
        label: { fontSize: fonts.text },
        separator: { height: 1, marginVertical: 4, backgroundColor: theme.colors.border },
      }),
      // An item's background, and its label's colour, by how it looks.
      boxes: StyleSheet.create({
        plain: {},
        hovered: { backgroundColor: theme.colors.surface2 },
        disabled: {},
      }),
      labels: StyleSheet.create({
        plain: { color: theme.colors.foreground },
        hovered: { color: theme.colors.foreground },
        disabled: { color: theme.colors.foregroundMuted },
      }),
      // An item's icon, before its label.
      icon: { size: fonts.fileIcon, color: theme.colors.foregroundMuted },
    }),
    [theme, fonts],
  );
}

type Styles = ReturnType<typeof useStyles>;

interface PopupProps {
  // Its id on the page.
  id?: string;
  role: "menu" | "dialog";
  // Its accessible name.
  label: string;
  // Where it was opened.
  point: Point;
  onClose: () => void;
  theme: PluginTheme;
  children: ReactNode;
}

// At the point, over the whole page, until it's closed: with Escape, or a click or a right click
// outside it.
export function Popup({
  id,
  role,
  label,
  point,
  onClose,
  theme,
  children,
}: PopupProps): ReactElement {
  const styles = useStyles(theme);
  const window = useWindowDimensions();
  const [size, setSize] = useState<Size>();
  const backdrop = useId();

  useContextMenu(backdrop, onClose);

  return (
    <Modal transparent visible onRequestClose={onClose}>
      <View
        nativeID={id}
        role={role}
        accessibilityLabel={label}
        style={[
          styles.popup,
          menuPosition(point, size ?? { width: 0, height: 0 }, window),
          size === undefined && styles.unmeasured,
        ]}
        onLayout={(event) => {
          setSize(event.nativeEvent.layout);
        }}
      >
        {children}
      </View>
      <Pressable
        nativeID={backdrop}
        accessibilityRole="button"
        accessibilityLabel="Close menu"
        focusable={false}
        style={StyleSheet.absoluteFill}
        onPress={onClose}
      />
    </Modal>
  );
}

interface MenuItem {
  label: string;
  // A Lucide icon's name.
  icon: string;
  onPress: () => void;
  // Shown, but not pressable, as while there's nothing for it to do.
  disabled: boolean;
}

interface MenuItemProps extends MenuItem {
  onFocus: () => void;
  itemRef: Ref<View>;
  styles: Styles;
}

function Item({
  label,
  icon,
  onPress,
  disabled,
  onFocus,
  itemRef,
  styles,
}: MenuItemProps): ReactElement {
  return (
    <Hoverable
      ref={itemRef}
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onFocus={onFocus}
    >
      {({ hovered }) => {
        const look = itemLook(hovered, disabled);

        return (
          <View style={[styles.item, styles.boxes[look]]}>
            <Icon name={icon} size={styles.icon.size} color={styles.icon.color} />
            <Text selectable={false} style={[styles.label, styles.labels[look]]}>
              {label}
            </Text>
          </View>
        );
      }}
    </Hoverable>
  );
}

interface MenuProps {
  // Its accessible name.
  label: string;
  point: Point;
  // Its items, in sections with a line between each. An empty section is left out.
  sections: readonly (readonly MenuItem[])[];
  onClose: () => void;
  theme: PluginTheme;
}

// A right-click menu, at the point, which closes once an item is chosen, before the item runs. ↓
// and ↑ move focus from one item to the next or the one before, round from the last to the first
// and back.
export function Menu({ label, point, sections, onClose, theme }: MenuProps): ReactElement {
  const styles = useStyles(theme);
  const id = useId();
  const shown = sections.filter((section) => section.length > 0);
  const count = shown.flat().length;
  const items = useRef<(View | null)[]>([]);
  const focused = useRef(0);

  useCommands(id, "menu", (command) => {
    const next = menuStep(command, focused.current, count);

    items.current[next]?.focus();

    return next !== focused.current;
  });

  // Each item's index among all the menu's.
  const starts = shown.map((_, index) => shown.slice(0, index).flat().length);

  return (
    <Popup id={id} role="menu" label={label} point={point} onClose={onClose} theme={theme}>
      {shown.map((section, index) => (
        <Fragment key={section.map((item) => item.label).join("\n")}>
          {index === 0 ? null : <View style={styles.separator} />}
          {section.map((item, position) => {
            const at = (starts[index] ?? 0) + position;

            return (
              <Item
                key={at}
                {...item}
                onPress={() => {
                  onClose();
                  item.onPress();
                }}
                onFocus={() => {
                  focused.current = at;
                }}
                itemRef={(element) => {
                  items.current[at] = element;
                }}
                styles={styles}
              />
            );
          })}
        </Fragment>
      ))}
    </Popup>
  );
}
