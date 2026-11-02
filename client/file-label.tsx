import { Icon } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import { useMemo } from "react";
import type { StyleProp, TextStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";

import { fileIcon } from "./file-icons";

// The icon's size, and its distance from the path, as in Paseo's Changes tab.
const iconSize = 16;
const iconGap = 8;

const styles = StyleSheet.create({
  label: { flexDirection: "row", alignItems: "center", gap: iconGap },
  path: { flexShrink: 1 },
});

interface FileLabelProps {
  path: string;
  style: StyleProp<TextStyle>;
}

// A file's path, after the icon Paseo's Changes tab draws for the file.
export function FileLabel({ path, style }: FileLabelProps): ReactElement {
  const icon = useMemo(() => fileIcon(path), [path]);

  return (
    <View style={styles.label}>
      <Icon icon={icon} size={iconSize} />
      <Text numberOfLines={1} style={[styles.path, style]}>
        {path}
      </Text>
    </View>
  );
}
