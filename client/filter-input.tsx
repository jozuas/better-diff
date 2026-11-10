import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, TextInput } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import { useContext, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { TextInput as NativeTextInput } from "react-native";
import { StyleSheet, View } from "react-native";

import { KeyboardFocusContext } from "./focus";
import { FontSizesContext } from "./fonts";
import { Hoverable, TintLayer } from "./hoverable";
import { useCommands } from "./keyboard";
import type { CommandIn } from "./keymap";

interface FilterInputProps {
  filter: string;
  onFilter: (filter: string) => void;
  // Hears each command a key gives with focus in it, and says whether it did anything with it.
  onKey: (command: CommandIn<"filter">) => boolean;
  theme: PluginTheme;
}

// What the file list's files are filtered by, with a button on its right that clears it, while it
// has something to clear. Keys move focus to it.
export function FilterInput({ filter, onFilter, onKey, theme }: FilterInputProps): ReactElement {
  const input = useRef<NativeTextInput>(null);
  const [focused, setFocused] = useState(false);
  const fonts = useContext(FontSizesContext);
  const focus = useContext(KeyboardFocusContext);
  const id = useId();

  useLayoutEffect(
    () =>
      focus.addFilter({
        focus: () => {
          input.current?.focus();
        },
      }),
    [focus],
  );

  useCommands(id, "filter", onKey);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        box: {
          flexDirection: "row",
          alignItems: "center",
          minHeight: fonts.row,
          margin: 8,
          marginBottom: 0,
          paddingLeft: 8,
          borderWidth: 1,
          borderRadius: 6,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
        },
        // The box, rather than the input in it, shows it has focus.
        focused: { borderColor: theme.colors.accent },
        // As wide as the box leaves it, and no wider than it needs: fitting the file list to its
        // files leaves out an input's own width.
        input: {
          flex: 1,
          width: 0,
          paddingVertical: 5,
          fontSize: fonts.text,
          color: theme.colors.foreground,
          outlineWidth: 0,
        },
        // As far in from the box's end as from its top and bottom.
        clear: {
          width: fonts.row - 8,
          height: fonts.row - 8,
          alignItems: "center",
          justifyContent: "center",
          marginHorizontal: 3,
          borderRadius: 4,
          overflow: "hidden",
        },
      }),
    [theme, fonts],
  );

  return (
    <View nativeID={id} style={[styles.box, focused && styles.focused]}>
      <TextInput
        ref={input}
        tabIndex={-1}
        accessibilityLabel="Filter files"
        placeholder="Filter files..."
        placeholderTextColor={theme.colors.foregroundMuted}
        value={filter}
        onChangeText={onFilter}
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
      {filter === "" ? null : (
        <Hoverable
          accessibilityRole="button"
          accessibilityLabel="Clear filter"
          style={styles.clear}
          onPress={() => {
            onFilter("");
            input.current?.focus();
          }}
        >
          {({ hovered, pressed }) => (
            <>
              <TintLayer color={theme.colors.foreground} hovered={hovered} pressed={pressed} />
              <Icon
                name="X"
                size={fonts.buttonIcon}
                color={hovered ? theme.colors.foreground : theme.colors.foregroundMuted}
              />
            </>
          )}
        </Hoverable>
      )}
    </View>
  );
}
