import type { ReactElement, Ref } from "react";
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
  ref?: Ref<View> | undefined;
  children: (pointer: Pointer) => ReactElement;
}

// A pressable whose content hears whether the pointer is over it, as well as whether it's pressed.
// Tab doesn't reach it: keys of the panel's own do what it does.
export function Hoverable({
  onHoverIn,
  onHoverOut,
  children,
  ...props
}: HoverableProps): ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      tabIndex={-1}
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

// A filled button's tint, which fills it even while the pointer isn't over it, as Paseo fills its
// buttons in a surface a step above the one they're on, rather than outlining them.
const filledStyles = StyleSheet.create({
  none: { opacity: 0.1 },
  hovered: { opacity: 0.18 },
  pressed: { opacity: 0.28 },
});

interface TintLayerProps extends Pointer {
  color: string;
  filled?: boolean;
}

// Under a button's label, tinting the button in the label's colour, which the button clips to its
// corners.
export function TintLayer({
  color,
  hovered,
  pressed,
  filled = false,
}: TintLayerProps): ReactElement {
  const tint = tintOf(hovered, pressed);

  return (
    <View
      style={[styles.tint, (filled ? filledStyles : styles)[tint], { backgroundColor: color }]}
    />
  );
}
