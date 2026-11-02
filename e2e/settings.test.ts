import { commitAll, writeFile } from "../test/repository";
import { changesSettings, expect, test } from "./fixtures";
import { button, line, openFile, showLayout } from "./panel";

changesSettings();

// Commits `a.txt`, then changes the line after an unchanged one.
function changeOne(repository: string): void {
  writeFile(repository, "a.txt", "kept\nold\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "kept\nnew\n");
}

test("Better Diff's page in Paseo's settings picks the diff style, which the file bar's toggle changes too", async ({
  app,
  page,
  repository,
}) => {
  changeOne(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await showLayout(page, "inline");
  await app.openSettings();
  await button(page, "Diff style: Inline").click();
  await page.getByRole("menuitem", { name: "Side by side", exact: true }).click();

  await expect(button(page, "Diff style: Side by side")).toBeVisible();

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(line(page, "kept")).toHaveCount(2);

  await button(page, "Show inline").click();
  await app.openSettings();

  await expect(button(page, "Diff style: Inline")).toBeVisible();
});
