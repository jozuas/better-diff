import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { useContext, useEffect, useId, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { copyItems, copyLabel } from "./copy";
import type { CopyItem } from "./copy";
import { FontSizesContext } from "./fonts";
import { Hoverable } from "./hoverable";
import { menuPosition } from "./menu";
import type { Point, Size } from "./menu";
import { onContextMenu } from "./web";

function useStyles(theme: PluginTheme) {
  const fonts = useContext(FontSizesContext);

  return useMemo(
    () =>
      StyleSheet.create({
        // Over the backdrop, which comes after it so that the modal's focus goes to its first item.
        menu: {
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
        item: { paddingHorizontal: 12, paddingVertical: 4 },
        hovered: { backgroundColor: theme.colors.surface2 },
        label: { fontSize: fonts.text, color: theme.colors.foreground },
      }),
    [theme, fonts],
  );
}

type Styles = ReturnType<typeof useStyles>;

interface MenuItemProps {
  label: string;
  onPress: () => void;
  styles: Styles;
}

function MenuItem({ label, onPress, styles }: MenuItemProps): ReactElement {
  return (
    <Hoverable accessibilityRole="menuitem" accessibilityLabel={label} onPress={onPress}>
      {({ hovered }) => (
        <View style={[styles.item, hovered && styles.hovered]}>
          <Text selectable={false} style={styles.label}>
            {label}
          </Text>
        </View>
      )}
    </Hoverable>
  );
}

interface FileMenuProps {
  // The file's, which names the menu.
  path: string;
  // Where it was opened.
  point: Point;
  onCopy: (item: CopyItem) => void;
  onClose: () => void;
  theme: PluginTheme;
}

// A file's right-click menu, at the point, over the whole page until an item is chosen or it's
// closed: with Escape, or a click or a right click outside it.
export function FileMenu({ path, point, onCopy, onClose, theme }: FileMenuProps): ReactElement {
  const styles = useStyles(theme);
  const window = useWindowDimensions();
  const [size, setSize] = useState<Size>();
  const backdrop = useId();

  useEffect(() => onContextMenu(backdrop, onClose), [backdrop, onClose]);

  return (
    <Modal transparent visible onRequestClose={onClose}>
      <View
        accessibilityRole="menu"
        accessibilityLabel={path}
        style={[
          styles.menu,
          menuPosition(point, size ?? { width: 0, height: 0 }, window),
          size === undefined && styles.unmeasured,
        ]}
        onLayout={(event) => {
          setSize(event.nativeEvent.layout);
        }}
      >
        {copyItems.map((item) => (
          <MenuItem
            key={item}
            label={copyLabel(item)}
            onPress={() => {
              onClose();
              onCopy(item);
            }}
            styles={styles}
          />
        ))}
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
