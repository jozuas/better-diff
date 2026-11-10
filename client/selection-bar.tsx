import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { useContext, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { FontSizesContext } from "./fonts";
import { IconButton } from "./icon-button";
import { useKeptSelection } from "./keyboard";
import { barPosition } from "./menu";
import type { Point, Rect, Size } from "./menu";

function useStyles(theme: PluginTheme) {
  const fonts = useContext(FontSizesContext);

  return useMemo(
    () => ({
      ...StyleSheet.create({
        // Over the lines, and over the bars of the hunks after them.
        bar: {
          position: "absolute",
          zIndex: 20,
          flexDirection: "row",
          gap: 4,
          padding: 4,
          borderWidth: 1,
          borderRadius: 8,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
        },
        // Until it's measured, and so can be placed.
        unmeasured: { opacity: 0 },
      }),
      // How far it is from the point the pointer let go at, which is in a line: past the half of the
      // line on its side, and a little more.
      gap: fonts.codeLine / 2 + 4,
    }),
    [theme, fonts],
  );
}

// Where the pointer let go of a selection: the point, where the lines it's in were on the page
// then, and the highest the page showed them from, under the bars that stay at the top of the view.
export interface LetGo {
  point: Point;
  area: Rect;
  ceiling: number;
}

interface CommentProps {
  // Undefined where the selection can't be commented on.
  onComment: (() => void) | undefined;
  theme: PluginTheme;
}

// Comment, where the selection can be commented on.
function Comment({ onComment, theme }: CommentProps): ReactElement | null {
  return onComment === undefined ? null : (
    <IconButton
      label="Comment"
      name="Comment"
      icon="MessageCircle"
      onPress={onComment}
      theme={theme}
    />
  );
}

interface SelectionBarProps {
  // Its id on the page.
  id: string;
  at: LetGo;
  // Undefined where the selection can't be commented on.
  onComment: (() => void) | undefined;
  onCopy: () => void;
  theme: PluginTheme;
}

// Over the selected lines, above where the pointer let go of the selection, as in Linear's PR
// review: Comment, where it can start a comment, and Copy, each named above it once the pointer
// rests on it. Pressing it leaves the selection, and focus, as they are.
export function SelectionBar({
  id,
  at,
  onComment,
  onCopy,
  theme,
}: SelectionBarProps): ReactElement {
  const styles = useStyles(theme);
  const [size, setSize] = useState<Size>();

  useKeptSelection(id);

  return (
    <View
      nativeID={id}
      role="toolbar"
      accessibilityLabel="Selection"
      style={[
        styles.bar,
        barPosition(at.point, at.area, size ?? { width: 0, height: 0 }, at.ceiling, styles.gap),
        size === undefined && styles.unmeasured,
      ]}
      onLayout={(event) => {
        setSize(event.nativeEvent.layout);
      }}
    >
      <Comment onComment={onComment} theme={theme} />
      <IconButton label="Copy" name="Copy" icon="Copy" onPress={onCopy} theme={theme} />
    </View>
  );
}
