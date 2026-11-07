import type { PluginTheme } from "@getpaseo/plugin";
import { TextInput } from "@getpaseo/plugin/client/ui";
import type { ReactElement, ReactNode } from "react";
import { useContext, useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";

import { collapsedText, countText, findCommand, findKeyText } from "./find-keys";
import { focusAndSelect } from "./find-page";
import type { PanelFind } from "./find-page";
import { FindContext } from "./find-store";
import type { Find } from "./find-store";
import { FontSizesContext } from "./fonts";
import { Hoverable, TintLayer } from "./hoverable";
import { IconButton } from "./icon-button";
import { useCommands } from "./keyboard";
import { ShortcutTip } from "./shortcut-tip";
import { onMac } from "./web";

function useStyles(theme: PluginTheme) {
  const fonts = useContext(FontSizesContext);

  return useMemo(
    () =>
      StyleSheet.create({
        bar: {
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderTopWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
        },
        box: {
          flexDirection: "row",
          alignItems: "center",
          width: 280,
          flexShrink: 1,
          paddingLeft: 8,
          paddingRight: 3,
          borderWidth: 1,
          borderRadius: 6,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface0,
        },
        // The box, rather than the input in it, shows it has focus.
        focused: { borderColor: theme.colors.accent },
        input: {
          flex: 1,
          width: 0,
          paddingVertical: 5,
          fontSize: fonts.text,
          color: theme.colors.foreground,
          outlineWidth: 0,
        },
        toggle: {
          paddingHorizontal: 4,
          paddingVertical: 1,
          borderWidth: 1,
          borderRadius: 4,
          borderColor: "transparent",
        },
        // Clips the tint to the toggle's corners, but not its key under it.
        face: { ...StyleSheet.absoluteFillObject, borderRadius: 4, overflow: "hidden" },
        toggled: { borderColor: theme.colors.accent },
        toggleText: { fontSize: fonts.small, fontWeight: "600" },
        count: { fontSize: fonts.small, color: theme.colors.foreground },
        note: { fontSize: fonts.small, color: theme.colors.foregroundMuted },
        // On the bar's right.
        buttons: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: "auto" },
      }),
    [theme, fonts],
  );
}

type Styles = ReturnType<typeof useStyles>;

interface MatchCaseFaceProps {
  on: boolean;
  hovered: boolean;
  pressed: boolean;
  // Whether the pointer rests on it, unpressed.
  resting: boolean;
  styles: Styles;
  theme: PluginTheme;
}

// "Aa", bright while it's on or the pointer is over it, and its key under it once the pointer rests
// on it.
function MatchCaseFace({
  on,
  hovered,
  pressed,
  resting,
  styles,
  theme,
}: MatchCaseFaceProps): ReactElement {
  const color = on || hovered ? theme.colors.foreground : theme.colors.foregroundMuted;

  return (
    <>
      <View style={styles.face}>
        <TintLayer color={color} hovered={hovered} pressed={pressed} />
      </View>
      <Text selectable={false} style={[styles.toggleText, { color }]}>
        Aa
      </Text>
      <ShortcutTip shortcut={findKeyText("matchCase", onMac())} resting={resting} theme={theme} />
    </>
  );
}

interface MatchCaseProps {
  on: boolean;
  onToggle: () => void;
  styles: Styles;
  theme: PluginTheme;
}

// Match case, which while it's on has what's typed match only its own case, outlined in the accent
// colour.
function MatchCase({ on, onToggle, styles, theme }: MatchCaseProps): ReactElement {
  return (
    <Hoverable
      accessibilityRole="checkbox"
      accessibilityLabel="Match case"
      aria-checked={on}
      style={[styles.toggle, on && styles.toggled]}
      onPress={onToggle}
    >
      {(pointer) => (
        <MatchCaseFace
          on={on}
          {...pointer}
          resting={pointer.hovered && !pointer.pressed}
          styles={styles}
          theme={theme}
        />
      )}
    </Hoverable>
  );
}

interface FindBarProps {
  find: Find;
  // The id of its input.
  input: string;
  onClose: () => void;
  theme: PluginTheme;
}

// Under the diff while it's open: what to find, Match case, which match is current of how many,
// how many collapsed files it leaves out, and buttons that move to the match before and the next
// one, and close it, each of which has a key in it, as the keymap has them. Once it shows, focus is
// in its input, with what's typed selected.
function FindBar({ find, input, onClose, theme }: FindBarProps): ReactElement {
  const styles = useStyles(theme);
  const state = useSyncExternalStore(find.subscribe, find.state);
  const bar = useId();
  const [focused, setFocused] = useState(false);
  const collapsed = collapsedText(state.collapsed);

  useEffect(() => {
    focusAndSelect(input);
  }, [input]);

  useCommands(bar, "find", (command) => findCommand(command, { find, onClose }));

  return (
    <View nativeID={bar} style={styles.bar}>
      <View style={[styles.box, focused && styles.focused]}>
        <TextInput
          nativeID={input}
          accessibilityLabel="Find in diff"
          placeholder="Find in diff"
          placeholderTextColor={theme.colors.foregroundMuted}
          value={state.text}
          onChangeText={find.search}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          onFocus={() => {
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
          }}
          style={styles.input}
        />
        <MatchCase
          on={state.matchCase}
          onToggle={() => {
            find.setMatchCase(!state.matchCase);
          }}
          styles={styles}
          theme={theme}
        />
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.count}>
        {countText(state)}
      </Text>
      {collapsed === undefined ? null : <Text style={styles.note}>{collapsed}</Text>}
      <View style={styles.buttons}>
        <IconButton
          label="Previous match"
          icon="ChevronUp"
          shortcut={findKeyText("previous", onMac())}
          onPress={() => {
            find.step(-1);
          }}
          theme={theme}
        />
        <IconButton
          label="Next match"
          icon="ChevronDown"
          shortcut={findKeyText("next", onMac())}
          onPress={() => {
            find.step(1);
          }}
          theme={theme}
        />
        <IconButton
          label="Close find"
          icon="X"
          shortcut={findKeyText("close", onMac())}
          onPress={onClose}
          theme={theme}
        />
      </View>
    </View>
  );
}

interface DiffWithFindProps {
  panelFind: PanelFind;
  theme: PluginTheme;
  // The diff, which finds in what it shows.
  children: ReactNode;
}

// The diff, with the find bar under it while it's open.
export function DiffWithFind({ panelFind, theme, children }: DiffWithFindProps): ReactElement {
  const { find, open, input, onClose } = panelFind;

  return (
    <>
      <FindContext value={find}>{children}</FindContext>
      {open ? <FindBar find={find} input={input} onClose={onClose} theme={theme} /> : null}
    </>
  );
}
