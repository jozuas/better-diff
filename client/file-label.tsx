import { Icon } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import { useContext, useMemo } from "react";
import type { StyleProp, TextStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";

import { fileIcon } from "./file-icons";
import { FontSizesContext } from "./fonts";
import type { FontSizes } from "./fonts";

function useStyles(fonts: FontSizes) {
  return useMemo(
    () =>
      StyleSheet.create({
        label: { flexDirection: "row", alignItems: "center", gap: fonts.fileIconGap },
        // The SVG would shrink with the path, where it's cut short. A View doesn't.
        icon: { width: fonts.fileIcon, height: fonts.fileIcon },
        path: { flexShrink: 1 },
      }),
    [fonts],
  );
}

interface FileLabelProps {
  path: string;
  style: StyleProp<TextStyle>;
}

// A file's path, after the icon Paseo's Changes tab draws for the file.
export function FileLabel({ path, style }: FileLabelProps): ReactElement {
  const fonts = useContext(FontSizesContext);
  const styles = useStyles(fonts);
  const icon = useMemo(() => fileIcon(path), [path]);

  return (
    <View style={styles.label}>
      <View style={styles.icon}>
        <Icon icon={icon} size={fonts.fileIcon} />
      </View>
      <Text numberOfLines={1} style={[styles.path, style]}>
        {path}
      </Text>
    </View>
  );
}
