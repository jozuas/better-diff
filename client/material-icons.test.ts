import { expect, test } from "vitest";

import { materialIcon, paseoExtensions } from "../test/file-icons";
import { defaultIcon, icons } from "./material-icons";

test.each(icons.flatMap(({ extensions, svg }) => extensions.map((extension) => [extension, svg])))(
  "the icon for %s is the one Material Icon Theme has for it",
  (extension, svg) => {
    expect(svg).toBe(materialIcon(extension));
  },
);

test("the default icon is the one Material Icon Theme has for a file it has no icon for", () => {
  expect(defaultIcon).toBe(materialIcon(""));
});

test("there are icons for the extensions Paseo's Changes tab draws an icon for, and no others", () => {
  expect(icons.flatMap(({ extensions }) => extensions).toSorted()).toStrictEqual(paseoExtensions);
});
