import type { PluginTheme } from "@getpaseo/plugin";
import { copyText, useToast } from "@getpaseo/plugin/client/ui";
import { useMutation } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useId, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";

import type { Point } from "./menu";
import { Menu } from "./popup";
import { selectedText } from "./text-selection";
import { useContextMenu } from "./web";

// Where the menu was opened, and the text selected then, which pressing its item can unselect.
interface Opened {
  point: Point;
  text: string;
}

interface LinesMenuProps {
  // The path of the file whose lines it's of, which names it.
  path: string;
  // Undefined while it's closed.
  opened: Opened | undefined;
  onCopy: (text: string) => void;
  onClose: () => void;
  theme: PluginTheme;
}

// Copies the text selected, while there is some.
function LinesMenu({ path, opened, onCopy, onClose, theme }: LinesMenuProps): ReactElement | null {
  if (opened === undefined) {
    return null;
  }

  const { point, text } = opened;

  return (
    <Menu
      label={path}
      point={point}
      sections={[
        [
          {
            label: "Copy",
            icon: "Copy",
            disabled: text === "",
            onPress: () => {
              onCopy(text);
            },
          },
        ],
      ]}
      onClose={onClose}
      theme={theme}
    />
  );
}

interface LinesAreaProps {
  // The path of the file whose lines they are.
  path: string;
  style?: StyleProp<ViewStyle>;
  theme: PluginTheme;
  children: ReactNode;
}

// Lines of a diff, which open the menu of its lines where they're right-clicked, in place of the
// page's own. Its backdrop takes a right click elsewhere, so only one is open at a time.
export function LinesArea({ path, style, theme, children }: LinesAreaProps): ReactElement {
  const id = useId();
  const toast = useToast();
  const [opened, setOpened] = useState<Opened>();

  const copy = useMutation({
    mutationFn: copyText,
    onError: (error) => {
      toast.error(error.message);
    },
  });

  useContextMenu(id, (point) => {
    setOpened({ point, text: selectedText() });
  });

  return (
    <View nativeID={id} style={style}>
      {children}
      <LinesMenu
        path={path}
        opened={opened}
        onCopy={copy.mutate}
        onClose={() => {
          setOpened(undefined);
        }}
        theme={theme}
      />
    </View>
  );
}
