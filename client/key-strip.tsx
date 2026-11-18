import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement, ReactNode } from "react";
import { useContext, useEffect, useId, useMemo, useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FontSizesContext } from "./fonts";
import type { OpenFile } from "./groups";
import { hintsIn, KeyHintsContext, keyHints } from "./key-hints";
import type { Hint } from "./key-hints";
import { useRestingHints } from "./keyboard";
import type { LineRange } from "./selection";
import type { Focus } from "./side-by-side";
import { onMac } from "./web";

interface HintedProps {
  // Whether focus is in the place it's rendered in.
  focused: boolean;
  hints: () => Hint[];
}

// Shows the hints `hints` gives, in the panel's strip, while focus is in the place it's rendered
// in, and none of its own once it isn't, or it's gone. Renders nothing itself.
export function Hinted({ focused, hints }: HintedProps): null {
  const shown = useContext(KeyHintsContext);
  const owner = useId();

  useEffect(() => {
    if (focused) {
      shown.show(owner, hints());
    } else {
      shown.hide(owner);
    }
  });

  useEffect(
    () => () => {
      shown.hide(owner);
    },
    [shown, owner],
  );

  return null;
}

interface HunkHintsProps {
  focused: boolean;
  file: OpenFile;
  // The hunk's index in its file's diff.
  index: number;
  // The lines selected in its file's diff, if any.
  selection: LineRange | undefined;
  // Which side has focus, side by side.
  sides: Focus | undefined;
}

// A hunk's bar's hints, or its selected lines' while it has any.
export function HunkHints({
  focused,
  file,
  index,
  selection,
  sides,
}: HunkHintsProps): ReactElement {
  return (
    <Hinted
      focused={focused}
      hints={() =>
        hintsIn.hunk(
          file.group,
          { selected: selection?.hunk === index, sideBySide: sides !== undefined },
          onMac(),
        )
      }
    />
  );
}

interface KeyStripProps {
  theme: PluginTheme;
}

// A strip along the bottom of the panel, with the keys that work where focus is, and what each
// does, as lazygit's bottom line has them, so the keys are learnt from the keyboard too. One line,
// as tall with hints as without, which cuts off those it has no room for.
function KeyStrip({ theme }: KeyStripProps): ReactElement {
  const fonts = useContext(FontSizesContext);
  const hints = useContext(KeyHintsContext);
  const shown = useSyncExternalStore(hints.subscribe, hints.state);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        // One line: a hint it has no room for wraps to a line under it, out of sight.
        strip: {
          flexDirection: "row",
          flexWrap: "wrap",
          alignContent: "flex-start",
          columnGap: 16,
          rowGap: 2 * fonts.small,
          height: 2 * fonts.small,
          paddingHorizontal: 12,
          overflow: "hidden",
          borderTopWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
        },
        // As tall as the strip, under its border.
        hint: {
          fontSize: fonts.small,
          lineHeight: 2 * fonts.small - 1,
          color: theme.colors.foregroundMuted,
        },
        keys: { fontWeight: "600", color: theme.colors.foreground },
      }),
    [theme, fonts],
  );

  return (
    <View role="note" accessibilityLabel="Keys" style={styles.strip}>
      {shown.map(({ keys, does }) => (
        <Text key={`${keys} ${does}`} selectable={false} numberOfLines={1} style={styles.hint}>
          <Text style={styles.keys}>{keys}</Text> {does}
        </Text>
      ))}
    </View>
  );
}

interface WithKeyStripProps {
  // The panel's id.
  panel: string;
  theme: PluginTheme;
  // The panel's file list and diff, side by side.
  children: ReactNode;
}

const styles = StyleSheet.create({ columns: { flex: 1, flexDirection: "row" } });

// What the panel shows, over the strip of the keys that work where focus is in it, which the
// places in it show their hints with.
export function WithKeyStrip({ panel, theme, children }: WithKeyStripProps): ReactElement {
  const hints = useMemo(() => keyHints(), []);

  useRestingHints(panel, hints);

  return (
    <KeyHintsContext value={hints}>
      <View style={styles.columns}>{children}</View>
      <KeyStrip theme={theme} />
    </KeyHintsContext>
  );
}
