// Writes client/material-icons.ts: Material Icon Theme's icons for the extensions Paseo's Changes
// tab draws one for, and the one it draws for every other file. `npm run icons` runs it, then
// formats what it wrote.
import { writeFileSync } from "node:fs";

import { materialIcon, paseoExtensions } from "../test/file-icons.ts";

// The extensions each icon is for.
const icons = new Map<string, string[]>();

for (const extension of paseoExtensions) {
  const svg = materialIcon(extension);

  icons.set(svg, [...(icons.get(svg) ?? []), extension]);
}

writeFileSync(
  "client/material-icons.ts",
  `// Written by \`npm run icons\` from material-icon-theme.

// Material Icon Theme's icon for a file whose extension has none of these.
export const defaultIcon = ${JSON.stringify(materialIcon(""))};

// Material Icon Theme's icons for the extensions Paseo's Changes tab draws one for.
export const icons: { extensions: string[]; svg: string }[] = ${JSON.stringify(
    [...icons].map(([svg, extensionsOfIcon]) => ({ extensions: extensionsOfIcon, svg })),
  )};
`,
);
