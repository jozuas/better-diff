import { resolveSyntaxColors } from "@getpaseo/highlight";

import { commitAll, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { line, openFile } from "./panel";

// A #rrggbb colour as the page's computed styles give it.
function rgb(color: string): string {
  const [red, green, blue] = [1, 3, 5].map((start) =>
    Number.parseInt(color.slice(start, start + 2), 16),
  );

  return `rgb(${red}, ${green}, ${blue})`;
}

const themes = [
  { scheme: "light", name: "One Light" },
  { scheme: "dark", name: "One Dark" },
] as const;

for (const { scheme, name } of themes) {
  test.describe(`with Paseo's ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test(`a diff's lines are syntax highlighted in the colours of Paseo's default syntax theme, ${name}, its removed lines as the old version and its added ones as the new`, async ({
      app,
      page,
      repository,
    }) => {
      const colors = resolveSyntaxColors("one", scheme);

      writeFile(repository, "a.ts", "const a = 42;\n");
      commitAll(repository);
      writeFile(repository, "a.ts", 'const a = "b";\n');

      await app.openPanel();
      await openFile(page, "MODIFIED FILES (1)", "a.ts");

      await expect(line(page, "const")).toHaveCount(2);
      await expect(line(page, "const").first()).toHaveCSS("color", rgb(colors.keyword));
      await expect(line(page, "const").last()).toHaveCSS("color", rgb(colors.keyword));
      await expect(line(page, "42")).toHaveCSS("color", rgb(colors.number));
      await expect(line(page, '"b"')).toHaveCSS("color", rgb(colors.string));
    });
  });
}

test("a file Paseo's highlighter fails on, as its Nix grammar fails on one ending in a backslash, shows its diff without highlighting", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.nix", "const{\\\n");

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", "a.nix");

  await expect(line(page, "const{\\")).toBeVisible();
});
