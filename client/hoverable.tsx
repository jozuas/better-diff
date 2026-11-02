import type { ReactElement } from "react";
import { useState } from "react";
import type { PressableProps } from "react-native";
import { Pressable, StyleSheet, View } from "react-native";

import { tintOf } from "./tint";

// Whether the pointer is over a pressable, and whether it's pressed, by the pointer or the keyboard.
interface Pointer {
  hovered: boolean;
  pressed: boolean;
}

interface HoverableProps extends Omit<PressableProps, "children"> {
  children: (pointer: Pointer) => ReactElement;
}

// A pressable whose content hears whether the pointer is over it, as well as whether it's pressed.
export function Hoverable({
  onHoverIn,
  onHoverOut,
  children,
  ...props
}: HoverableProps): ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      {...props}
      onHoverIn={(event) => {
        setHovered(true);
        onHoverIn?.(event);
      }}
      onHoverOut={(event) => {
        setHovered(false);
        onHoverOut?.(event);
      }}
    >
      {({ pressed }) => children({ hovered, pressed })}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tint: StyleSheet.absoluteFillObject,
  none: { opacity: 0 },
  hovered: { opacity: 0.12 },
  pressed: { opacity: 0.24 },
});

interface TintLayerProps extends Pointer {
  color: string;
}

// Under a button's label, tinting the button in the label's colour, which the button clips to its
// corners.
export function TintLayer({ color, hovered, pressed }: TintLayerProps): ReactElement {
  return (
    <View style={[styles.tint, styles[tintOf(hovered, pressed)], { backgroundColor: color }]} />
  );
}
