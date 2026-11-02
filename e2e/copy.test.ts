import { realpathSync } from "node:fs";
import { join } from "node:path";

import type { Page } from "@playwright/test";
import { z } from "zod";

import { commitAll, deleteFile, runGit, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { row } from "./panel";

// Reads what the page's clipboard holds, each time it's called. A string, since the tests
// typecheck without the DOM library.
function clipboardOf(page: Page): () => Promise<string> {
  return async () => z.string().parse(await page.evaluate("navigator.clipboard.readText()"));
}

// Right-clicks the file's row, and picks the item from its menu.
async function copyFrom(page: Page, heading: string, path: string, item: string): Promise<void> {
  await row(page, heading, path).click({ button: "right" });
  await page.getByRole("menu", { name: path }).getByRole("menuitem", { name: item }).click();
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
});

test("right-clicking a file's row opens a menu that copies its full path, relative path and filename", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "src/a b.txt", "a\n");

  await app.openPanel();
  await copyFrom(page, "UNTRACKED FILES (1)", "src/a b.txt", "Copy full path");
  await expect.poll(clipboardOf(page)).not.toBe("");

  expect(realpathSync(await clipboardOf(page)())).toBe(
    realpathSync(join(repository, "src/a b.txt")),
  );

  await copyFrom(page, "UNTRACKED FILES (1)", "src/a b.txt", "Copy relative path");
  await expect.poll(clipboardOf(page)).toBe("src/a b.txt");
  await copyFrom(page, "UNTRACKED FILES (1)", "src/a b.txt", "Copy filename");
  await expect.poll(clipboardOf(page)).toBe("a b.txt");
  await expect(page.getByRole("menu")).toBeHidden();
});

test("copying a file's contents from its menu copies the file as it is in the worktree, whichever group lists it", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "staged\n");
  runGit(repository, ["add", "a.txt"]);
  writeFile(repository, "a.txt", "é\tworktree\r\nno final newline");

  await app.openPanel();
  await copyFrom(page, "STAGED FILES (1)", "a.txt", "Copy file contents");

  await expect.poll(clipboardOf(page)).toBe("é\tworktree\r\nno final newline");
});

test("copying the contents of a binary file, or a deleted one, copies nothing, and says why", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "gone.txt", "gone\n");
  commitAll(repository);
  deleteFile(repository, "gone.txt");
  writeFile(repository, "image.bin", Buffer.from([0x89, 0x50, 0x00, 0x47]));

  await app.openPanel();
  await page.evaluate("navigator.clipboard.writeText('before')");
  await copyFrom(page, "UNTRACKED FILES (1)", "image.bin", "Copy file contents");
  await expect(page.getByText("image.bin is a binary file, so nothing was copied.")).toBeVisible();
  await copyFrom(page, "MODIFIED FILES (1)", "gone.txt", "Copy file contents");
  await expect(page.getByText("There's no file at gone.txt to copy.")).toBeVisible();

  expect(await clipboardOf(page)()).toBe("before");
});

test("Escape, or a click or right click outside it, closes a file's menu", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");

  await app.openPanel();

  const menu = page.getByRole("menu", { name: "a.txt" });

  await row(page, "UNTRACKED FILES (1)", "a.txt").click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Copy full path" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  await row(page, "UNTRACKED FILES (1)", "a.txt").click({ button: "right" });
  await page.mouse.click(5, 5);
  await expect(menu).toBeHidden();

  await row(page, "UNTRACKED FILES (1)", "a.txt").click({ button: "right" });
  await page.mouse.click(5, 5, { button: "right" });
  await expect(menu).toBeHidden();
});
