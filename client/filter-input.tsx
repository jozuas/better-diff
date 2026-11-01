import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, TextInput } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import { useMemo, useRef, useState } from "react";
import type { TextInput as NativeTextInput } from "react-native";
import { Pressable, StyleSheet, View } from "react-native";

interface FilterInputProps {
  filter: string;
  onFilter: (filter: string) => void;
  theme: PluginTheme;
}

// What the file list's files are filtered by, with a button on its right that clears it, while it
// has something to clear.
export function FilterInput({ filter, onFilter, theme }: FilterInputProps): ReactElement {
  const input = useRef<NativeTextInput>(null);
  const [focused, setFocused] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        box: {
          flexDirection: "row",
          alignItems: "center",
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
          fontSize: 13,
          color: theme.colors.foreground,
          outlineWidth: 0,
        },
        clear: { paddingHorizontal: 8, paddingVertical: 6 },
      }),
    [theme],
  );

  return (
    <View style={[styles.box, focused && styles.focused]}>
      <TextInput
        ref={input}
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear filter"
          style={styles.clear}
          onPress={() => {
            onFilter("");
            input.current?.focus();
          }}
        >
          <Icon name="X" size={14} color={theme.colors.foregroundMuted} />
        </Pressable>
      )}
    </View>
  );
}
