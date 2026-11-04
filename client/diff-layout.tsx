import type { ReactElement } from "react";
import { useContext, useMemo, useState } from "react";
import { View } from "react-native";

import { showsSideBySide } from "./diff-style";
import type { Layout } from "./diff-style";
import { FontSizesContext } from "./fonts";
import { keptPlace } from "./place";
import { afterRender, KeptPlaceContext, useScrolled, viewPage } from "./web";

interface DiffLayoutProps {
  layout: Layout;
  // The id of the view the diffs scroll in.
  view: string;
  // The diffs, side by side or inline.
  children: (sideBySide: boolean) => ReactElement;
}

// The diffs, side by side or inline as the layout says for how wide this is at the lines' font size,
// once it's measured, in a view that keeps what's at its top in place, as a change of width that
// switches between them does.
export function DiffLayout({ layout, view, children }: DiffLayoutProps): ReactElement {
  const [width, setWidth] = useState<number>();
  const fonts = useContext(FontSizesContext);
  const kept = useMemo(() => keptPlace(viewPage(view), afterRender), [view]);

  useScrolled(view, kept.scrolled);

  const sideBySide = width === undefined ? undefined : showsSideBySide(layout, width, fonts);

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
    >
      <KeptPlaceContext value={kept}>
        {sideBySide === undefined ? null : children(sideBySide)}
      </KeptPlaceContext>
    </View>
  );
}
