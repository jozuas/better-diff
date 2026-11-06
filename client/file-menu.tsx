import type { PluginTheme } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";

import { copyItems, copyLabel } from "./copy";
import type { CopyItem } from "./copy";
import type { OpenFile } from "./groups";
import { ignoreItems } from "./ignore";
import type { IgnorePlace } from "./ignore";
import type { Ignoring } from "./ignore-prompt";
import type { Point } from "./menu";
import { Menu } from "./popup";

interface FileMenuProps {
  // The file, whose path names the menu.
  file: OpenFile;
  // Where it was opened.
  point: Point;
  onCopy: (item: CopyItem) => void;
  ignoring: Ignoring;
  // Asks for the rule ignoring the file, in the place picked.
  onIgnore: (place: IgnorePlace) => void;
  onClose: () => void;
  theme: PluginTheme;
}

// A file's right-click menu, which copies what it names of the file, and for an untracked file, has
// the places a rule ignoring it can go.
export function FileMenu({
  file,
  point,
  onCopy,
  ignoring,
  onIgnore,
  onClose,
  theme,
}: FileMenuProps): ReactElement {
  const untracked = file.group === "untracked";
  const excludesFile = useQuery({ ...ignoring.excludesFile, enabled: untracked });

  const ignoreSection = untracked
    ? ignoreItems(file.path, excludesFile.data).map(({ place, label, disabled }) => ({
        label,
        icon: "EyeOff",
        disabled,
        onPress: () => {
          onIgnore(place);
        },
      }))
    : [];

  return (
    <Menu
      label={file.path}
      point={point}
      sections={[
        copyItems.map((item) => ({
          label: copyLabel(item),
          icon: "Copy",
          disabled: false,
          onPress: () => {
            onCopy(item);
          },
        })),
        ignoreSection,
      ]}
      onClose={onClose}
      theme={theme}
    />
  );
}
