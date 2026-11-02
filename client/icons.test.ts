import { findSvgIconProblem } from "@getpaseo/plugin";
import type { PluginSvgIcon } from "@getpaseo/plugin";
import { expect, test } from "vitest";

import { entireFileIcon, onlyHunksIcon } from "./icons";

test.each<[string, PluginSvgIcon]>([
  ["entire file", entireFileIcon],
  ["only hunks", onlyHunksIcon],
])("the %s icon is SVG that Paseo draws, in the icon's colour alone", (_, icon) => {
  expect(findSvgIconProblem(icon.svg)).toBeNull();
  expect(icon.svg).not.toMatch(/(?:fill|stroke)="(?!none"|currentColor")/u);
});
