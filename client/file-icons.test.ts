import { findSvgIconProblem } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import { materialIcon, paseoExtensions } from "../test/file-icons";
import { filePath } from "../test/file-names";
import { fileIcon } from "./file-icons";

// The SVG without its colours, which muting them leaves the same.
function uncoloured(svg: string): string {
  return svg.replaceAll(/#[0-9a-f]{6}/gu, "#");
}

// Where a file is: the repository's root, or a directory, whose name may end in an extension.
const directory = fc.option(
  fc
    .tuple(filePath, fc.constantFrom("", ".ts", ".md"))
    .map(([path, extension]) => `${path}${extension}/`),
  { nil: "" },
);

// An extension Paseo draws an icon for, and it in any case.
const extension = fc
  .constantFrom(...paseoExtensions)
  .chain((name) => fc.tuple(fc.constant(name), fc.mixedCase(fc.constant(name))));

// Nothing, or a dot and an extension Paseo draws no icon for, which may be empty.
const noExtension = fc.option(
  fc
    .string({ unit: "binary" })
    .filter(
      (name) =>
        !name.includes(".") && !name.includes("/") && !paseoExtensions.includes(name.toLowerCase()),
    )
    .map((name) => `.${name}`),
  { nil: "" },
);

test("a TypeScript file gets Material Icon Theme's TypeScript icon, muted as Paseo mutes it", () => {
  expect(fileIcon("client/file-icons.ts")).toStrictEqual({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" viewBox="0 0 16 16"><path fill="#4a87b6" d="M2 2v12h12V2zm4 6h3v1H8v4H7V9H6zm5 0h2v1h-2v1h1a1.003 1.003 0 0 1 1 1v1a1.003 1.003 0 0 1-1 1h-2v-1h2v-1h-1a1.003 1.003 0 0 1-1-1V9a1.003 1.003 0 0 1 1-1"/></svg>',
  });
});

test("a Kotlin file's icon has each colour of its gradient muted, and still refers to the gradient", () => {
  expect(fileIcon("Main.kt")).toStrictEqual({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24"><defs><linearGradient id="a" x1="1.725" x2="22.185" y1="22.67" y2="1.982" gradientTransform="translate(1.306 1.129)scale(.89324)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7865d2"/><stop offset=".5" stop-color="#bd59d4"/><stop offset="1" stop-color="#d26f69"/></linearGradient></defs><path fill="url(#a)" d="M2.975 2.976v18.048h18.05v-.03l-4.478-4.511-4.48-4.515 4.48-4.515 4.443-4.477z"/></svg>',
  });
});

test("a file gets Material Icon Theme's icon for its extension, in any case, wherever it is", () => {
  fc.assert(
    fc.property(directory, filePath, extension, (inside, name, [lower, cased]) => {
      expect(uncoloured(fileIcon(`${inside}${name}.${cased}`).svg)).toBe(
        uncoloured(materialIcon(lower)),
      );
    }),
  );
});

test("a file without an extension, or with one Paseo draws no icon for, gets the default icon", () => {
  fc.assert(
    fc.property(directory, filePath, noExtension, (inside, name, ending) => {
      expect(uncoloured(fileIcon(`${inside}${name}${ending}`).svg)).toBe(
        uncoloured(materialIcon("")),
      );
    }),
  );
});

test("a file named as an extension is, without a dot, gets the default icon", () => {
  expect(fileIcon("ts")).toStrictEqual(fileIcon("Makefile"));
});

test.each(["Makefile", ...paseoExtensions.map((name) => `a.${name}`)])(
  "the icon of %s is SVG that Paseo draws",
  (path) => {
    expect(findSvgIconProblem(fileIcon(path).svg)).toBeNull();
  },
);
