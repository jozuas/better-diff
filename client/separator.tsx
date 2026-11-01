import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { GestureResponderEvent, GestureResponderHandlers } from "react-native";
import { StyleSheet, View } from "react-native";

import { draggedWidth } from "./resize";
import type { DragStart } from "./resize";
import { onDoubleClick, resizing, showResizeCursor } from "./web";

// The pixels either side of the separator's line that grab it too.
const grab = 6;

interface Resize {
  // The file list's width.
  width: number;
  // Hear the width wanted as the separator is dragged, and once it's let go.
  onResize: (wanted: number) => void;
  onResized: (wanted: number) => void;
}

// A drag of the separator, and the end of the cursor it shows meanwhile.
interface Drag extends DragStart {
  stop: () => void;
}

function useDrag({ width, onResize, onResized }: Resize) {
  const [drag, setDrag] = useState<Drag | null>(null);

  function end({ nativeEvent }: GestureResponderEvent): void {
    drag?.stop();
    setDrag(null);
    onResized(draggedWidth(drag, width, nativeEvent.pageX));
  }

  const handlers: GestureResponderHandlers = {
    onStartShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: ({ nativeEvent }) => {
      setDrag({ x: nativeEvent.pageX, width, stop: resizing() });
    },
    onResponderMove: ({ nativeEvent }) => {
      onResize(draggedWidth(drag, width, nativeEvent.pageX));
    },
    onResponderRelease: end,
    onResponderTerminate: end,
  };

  return { dragging: drag !== null, handlers };
}

// Calls the latest `onFit` on each double click on the element with the id.
function useDoubleClick(id: string, onFit: () => void): void {
  const fit = useRef(onFit);

  useEffect(() => {
    fit.current = onFit;
  });

  useEffect(
    () =>
      onDoubleClick(id, () => {
        fit.current();
      }),
    [id],
  );
}

interface SeparatorProps extends Resize {
  // Fits the file list to what it lists, on a double click.
  onFit: () => void;
  theme: PluginTheme;
}

// The line between the file list and the diff, which resizes the file list as it's dragged.
export function Separator({
  width,
  onResize,
  onResized,
  onFit,
  theme,
}: SeparatorProps): ReactElement {
  const id = useId();
  const { dragging, handlers } = useDrag({ width, onResize, onResized });

  useDoubleClick(id, onFit);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        // The line it shows, with transparent pixels either side to grab it by, over the edges
        // either side of it and taking no room from them. The line is over the file list's last
        // pixel.
        separator: {
          width: 2 * grab + 1,
          marginLeft: -(grab + 1),
          marginRight: -grab,
          zIndex: 1,
          alignItems: "center",
        },
        line: { flex: 1, width: 1, backgroundColor: theme.colors.border },
        dragged: { flex: 1, width: 1, backgroundColor: theme.colors.accent },
      }),
    [theme],
  );

  useEffect(() => {
    showResizeCursor(id);
  }, [id]);

  return (
    <View
      nativeID={id}
      accessibilityRole="adjustable"
      accessibilityLabel="File list width"
      aria-valuenow={Math.round(width)}
      style={styles.separator}
      {...handlers}
    >
      <View style={dragging ? styles.dragged : styles.line} />
    </View>
  );
}
