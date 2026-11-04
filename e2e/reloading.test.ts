import type { Locator, Page } from "@playwright/test";

import { commitAll, runGit, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { button, group, line, openFile, row } from "./panel";

function status(repository: string): string {
  return runGit(repository, ["status", "--porcelain", "--untracked-files=all"]);
}

// Commits the files, then changes each to "changed <path>".
function change(repository: string, paths: readonly string[]): void {
  for (const path of paths) {
    writeFile(repository, path, `${path}\n`);
  }

  commitAll(repository);

  for (const path of paths) {
    writeFile(repository, path, `changed ${path}\n`);
  }
}

// The changed files' added lines the diffs shown have, in their order.
function changedLines(page: Page): Locator {
  return page.getByText(/^changed .\.txt$/u);
}

test("once Paseo reloads, a tab shows the file it had open, the groups collapsed and the filter", async ({
  app,
  page,
  repository,
}) => {
  change(repository, ["a.txt", "b.txt"]);
  runGit(repository, ["add", "b.txt"]);
  writeFile(repository, "c.txt", "c\n");
  writeFile(repository, "d.txt", "d\n");

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (2)", "d.txt");
  await button(page, "STAGED FILES").click();
  await page.getByRole("textbox", { name: "Filter files" }).fill("d");
  await expect(group(page, "UNTRACKED FILES (1 of 2)")).toHaveText(["d.txt"]);

  await page.reload();

  await expect(page.getByRole("textbox", { name: "Filter files" })).toHaveValue("d");
  await expect(group(page, "UNTRACKED FILES (1 of 2)")).toHaveText(["d.txt"]);
  await expect(page.getByRole("button", { name: "STAGED FILES", expanded: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "UNTRACKED d.txt" })).toBeVisible();
  await expect(line(page, "d")).toBeVisible();
  expect(status(repository)).toBe(" M a.txt\nM  b.txt\n?? c.txt\n?? d.txt\n");
});

test("once Paseo reloads, a tab shows the files it had selected that their group still lists", async ({
  app,
  page,
  repository,
}) => {
  change(repository, ["a.txt", "b.txt", "c.txt", "d.txt"]);

  await app.holdWaits();
  await app.openPanel();
  await openFile(page, "MODIFIED FILES (4)", "a.txt");
  await row(page, "MODIFIED FILES (4)", "c.txt")
    .getByRole("button", { name: "c.txt", exact: true })
    .click({ modifiers: ["Shift"] });
  await expect(changedLines(page)).toHaveText(["changed a.txt", "changed b.txt", "changed c.txt"]);

  runGit(repository, ["add", "b.txt"]);
  await page.reload();

  await expect(changedLines(page)).toHaveText(["changed a.txt", "changed c.txt"]);
  await expect(page.getByRole("heading", { name: "MODIFIED a.txt" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "MODIFIED c.txt" })).toBeVisible();
  expect(status(repository)).toBe(" M a.txt\nM  b.txt\n M c.txt\n M d.txt\n");
});

test("once Paseo reloads, a tab whose open file has left its group opens the first file, as on opening Better Diff", async ({
  app,
  page,
  repository,
}) => {
  change(repository, ["a.txt"]);
  writeFile(repository, "c.txt", "c\n");
  writeFile(repository, "d.txt", "d\n");

  await app.holdWaits();
  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (2)", "d.txt");
  await expect(line(page, "d")).toBeVisible();

  runGit(repository, ["add", "d.txt"]);
  await page.reload();

  await expect(page.getByRole("heading", { name: "MODIFIED a.txt" })).toBeVisible();
  await expect(line(page, "changed a.txt")).toBeVisible();
  expect(status(repository)).toBe(" M a.txt\nA  d.txt\n?? c.txt\n");
});
