import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

// The extensions Paseo's Changes tab draws an icon for, in alphabetical order.
export const paseoExtensions = [
  "astro bash c cfg clj conf cpp cs css dart erl ex exs gif go gql gradle graphql groovy h hcl hpp",
  "hs html ico ini java jpeg jpg js json jsx kt less lock lua markdown md ml nix php png py r rb rs",
  "scala scss sh sql svelte svg swift tf toml ts tsx txt vue wasm webp xml yaml yml zig",
].flatMap((line) => line.split(" "));

const Manifest = z.object({
  // The icon for a file it has none for.
  file: z.string(),
  fileExtensions: z.record(z.string(), z.string()),
  iconDefinitions: z.record(z.string(), z.object({ iconPath: z.string() })),
});

const manifestPath = fileURLToPath(
  import.meta.resolve("material-icon-theme/dist/material-icons.json"),
);

const manifest = Manifest.parse(JSON.parse(readFileSync(manifestPath, "utf8")));

const extensionIcons = new Map(Object.entries(manifest.fileExtensions));

// Material Icon Theme's icon for a file with the extension, or for a file it has none for.
export function materialIcon(extension: string): string {
  const icon = manifest.iconDefinitions[extensionIcons.get(extension) ?? manifest.file];

  if (icon === undefined) {
    throw new Error(`Material Icon Theme's manifest defines no icon for ${extension}`);
  }

  return readFileSync(join(dirname(manifestPath), icon.iconPath), "utf8");
}
