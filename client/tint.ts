// How strongly a button is tinted in its label's colour: more while it's pressed, by the pointer or
// the keyboard, than while the pointer is only over it.
export type Tint = "pressed" | "hovered" | "none";

export function tintOf(hovered: boolean, pressed: boolean): Tint {
  if (pressed) {
    return "pressed";
  }

  return hovered ? "hovered" : "none";
}
