import type { Page } from "@playwright/test";

import { commitAll, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { button, row } from "./panel";

// A file with an extension Paseo has an icon for, one in another case, a file with none, and one in
// a directory.
const paths = ["README.md", "photo.PNG", "Makefile", "src/a.ts"];

// Checks that the untracked file at the path has the same icon in our row as in Paseo's Changes tab,
// whose tree shows it by its name alone. An icon drawn from SVG keeps it in its xml attribute.
async function expectPaseosIcon(page: Page, path: string): Promise<void> {
  const name = path.slice(path.lastIndexOf("/") + 1);

  const [ours, paseos] = await Promise.all([
    row(page, "UNTRACKED FILES (4)", path).locator("svg[xml]").getAttribute("xml"),
    page
      .getByTestId(/^diff-tree-file-\d+-header-content$/u)
      .filter({ has: page.getByText(name, { exact: true }) })
      .locator("svg[xml]")
      .getAttribute("xml"),
  ]);

  expect(ours).toBe(paseos);
}

test("each file's row starts with the icon Paseo's Changes tab shows the file with in its tree", async ({
  app,
  page,
  repository,
}) => {
  // Paseo's Changes tab shows nothing on a branch without commits.
  writeFile(repository, "a.txt", "a\n");
  commitAll(repository);

  for (const path of paths) {
    writeFile(repository, path, "a\n");
  }

  await app.openPanel();
  await button(page, "Open Explorer sidebar").click();
  await button(page, "Working tree diff").click();

  await Promise.all(
    paths.map(async (path) => {
      await expectPaseosIcon(page, path);
    }),
  );
});
