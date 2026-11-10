import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { ReactElement, ReactNode, Ref } from "react";
import { Fragment, useContext, useId, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { FontSizesContext } from "./fonts";
import { Hoverable } from "./hoverable";
import { useCommands, useContextMenu } from "./keyboard";
import { itemLook, itemName, menuPosition, menuStep } from "./menu";
import type { MenuItem, Point, Position, Size } from "./menu";

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
        // The SVG would shrink with the label, where it's cut short. A View doesn't.
        iconBox: { width: fonts.fileIcon, height: fonts.fileIcon },
        label: { flexShrink: 1, fontSize: fonts.text },
        detail: {
          marginLeft: "auto",
          paddingLeft: 12,
          fontSize: fonts.small,
          color: theme.colors.foregroundMuted,
        },
        separator: { height: 1, marginVertical: 4, backgroundColor: theme.colors.border },
      }),
      // An item's background, and its label's colour, by how it looks.
      boxes: StyleSheet.create({
        plain: {},
        hovered: { backgroundColor: theme.colors.surface2 },
        disabled: {},
        armed: { backgroundColor: theme.colors.surface2 },
      }),
      labels: StyleSheet.create({
        plain: { color: theme.colors.foreground },
        hovered: { color: theme.colors.foreground },
        disabled: { color: theme.colors.foregroundMuted },
        armed: { color: theme.colors.statusDanger },
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
  // Where it goes from there, by its size.
  place: (point: Point, popup: Size, window: Size) => Position;
  // How wide it can be, if it can't be as wide as what's in it.
  maxWidth?: number | undefined;
  onClose: () => void;
  theme: PluginTheme;
  children: ReactNode;
}

// From the point, over the whole page, until it's closed: with Escape, or a click or a right click
// outside it.
export function Popup({
  id,
  role,
  label,
  point,
  place,
  maxWidth,
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
          { maxWidth },
          place(point, size ?? { width: 0, height: 0 }, window),
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

interface MenuItemProps extends MenuItem {
  onFocus: () => void;
  itemRef: Ref<View>;
  styles: Styles;
}

function Item({
  label,
  detail,
  icon,
  onPress,
  disabled,
  armed,
  onFocus,
  itemRef,
  styles,
}: MenuItemProps): ReactElement {
  return (
    <Hoverable
      ref={itemRef}
      accessibilityRole="menuitem"
      accessibilityLabel={itemName(label, detail)}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onFocus={onFocus}
    >
      {({ hovered }) => {
        const look = itemLook(hovered, disabled, armed);

        return (
          <View style={[styles.item, styles.boxes[look]]}>
            <View style={styles.iconBox}>
              <Icon name={icon} size={styles.icon.size} color={styles.icon.color} />
            </View>
            <Text selectable={false} numberOfLines={1} style={[styles.label, styles.labels[look]]}>
              {label}
            </Text>
            {detail === undefined ? null : (
              <Text selectable={false} style={styles.detail}>
                {detail}
              </Text>
            )}
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
  // Where it goes from there, by its size, if not as a right-click menu goes.
  place?: (point: Point, menu: Size, window: Size) => Position;
  // How wide it can be, its items' labels cut short to fit, if it can't be as wide as they are.
  maxWidth?: number;
  // Its items, in sections with a line between each. An empty section is left out.
  sections: readonly (readonly MenuItem[])[];
  onClose: () => void;
  theme: PluginTheme;
}

// A menu, at the point as a right-click menu is unless it's placed otherwise, which closes once an
// item is chosen, before the item runs, but for one that stays open for it to ask to be chosen
// again. ↓ and ↑ move focus from one item to the next or the one before, round from the last to
// the first and back.
export function Menu({
  label,
  point,
  place = menuPosition,
  maxWidth,
  sections,
  onClose,
  theme,
}: MenuProps): ReactElement {
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
    <Popup
      id={id}
      role="menu"
      label={label}
      point={point}
      place={place}
      maxWidth={maxWidth}
      onClose={onClose}
      theme={theme}
    >
      {shown.map((section, index) => (
        <Fragment key={starts[index]}>
          {index === 0 ? null : <View role="separator" style={styles.separator} />}
          {section.map((item, position) => {
            const at = (starts[index] ?? 0) + position;

            return (
              <Item
                key={at}
                {...item}
                onPress={() => {
                  if (item.stays !== true) {
                    onClose();
                  }

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
