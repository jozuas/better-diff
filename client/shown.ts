// The size a view is laid out at.
interface Size {
  readonly width: number;
  readonly height: number;
}

// What hears a view's layout as the listener does, but not while the view is hidden, as Paseo hides
// a tab while another in its pane shows: it measures 0 by 0 then, not the room it has once it shows
// again.
export function whileShown(
  listener: (size: Size) => void,
): (event: { nativeEvent: { layout: Size } }) => void {
  return ({ nativeEvent: { layout } }) => {
    if (layout.width > 0 || layout.height > 0) {
      listener(layout);
    }
  };
}
