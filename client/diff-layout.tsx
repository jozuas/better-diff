import type { ReactElement } from "react";
import { useContext, useState } from "react";
import { View } from "react-native";

import { showsSideBySide } from "./diff-style";
import type { Layout } from "./diff-style";
import { FontSizesContext } from "./fonts";
import { useHeldPlace } from "./web";

interface DiffLayoutProps {
  layout: Layout;
  // The id of the view the diffs scroll in.
  view: string;
  // The diffs, side by side or inline.
  children: (sideBySide: boolean) => ReactElement;
}

// The diffs, side by side or inline as the layout says for how wide this is at the lines' font size,
// once it's measured. A change of width that switches between them keeps what's at the top of
// the view in place.
export function DiffLayout({ layout, view, children }: DiffLayoutProps): ReactElement {
  const [width, setWidth] = useState<number>();
  const fonts = useContext(FontSizesContext);

  const sideBySide = width === undefined ? undefined : showsSideBySide(layout, width, fonts);

  const hold = useHeldPlace(view, String(sideBySide), false);

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(event) => {
        const measured = event.nativeEvent.layout.width;

        if (sideBySide !== undefined && showsSideBySide(layout, measured, fonts) !== sideBySide) {
          hold();
        }

        setWidth(measured);
      }}
    >
      {sideBySide === undefined ? null : children(sideBySide)}
    </View>
  );
}
