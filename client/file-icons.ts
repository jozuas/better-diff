import type { PluginSvgIcon } from "@getpaseo/plugin";

import { defaultIcon, icons } from "./material-icons";
import { mutedColour } from "./muted";

const extensionIcons = new Map(
  icons.flatMap(({ extensions, svg }) =>
    extensions.map((extension): [string, string] => [extension, svg]),
  ),
);

// The icon Paseo's Changes tab draws for the file at the path: Material Icon Theme's for its
// extension, after the last dot in its name, in any case, with its colours muted. An extension with
// a slash in it is a directory's, and none of the icons'.
export function fileIcon(path: string): PluginSvgIcon {
  const dot = path.lastIndexOf(".");

  const svg =
    dot === -1
      ? defaultIcon
      : (extensionIcons.get(path.slice(dot + 1).toLowerCase()) ?? defaultIcon);

  return { svg: svg.replaceAll(/#[0-9a-f]{6}/gu, mutedColour) };
}
