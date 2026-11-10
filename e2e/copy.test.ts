import { realpathSync } from "node:fs";
import { join } from "node:path";

import type { Page } from "@playwright/test";

import { commitAll, deleteFile, runGit, writeFile, writeSymlink } from "../test/repository";
import { expect, test } from "./fixtures";
import { button, clipboardOf, line, openFile, row, selectLines } from "./panel";

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

test("copying a symlink's contents copies the path it points to, as git stores it", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");
  writeSymlink(repository, "link", "a.txt");

  await app.openPanel();
  await copyFrom(page, "UNTRACKED FILES (2)", "link", "Copy file contents");

  await expect.poll(clipboardOf(page)).toBe("a.txt");
});

test("copying the contents of a binary file, one larger than 10 MB, or a deleted one, copies nothing, and says why", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "gone.txt", "gone\n");
  commitAll(repository);
  deleteFile(repository, "gone.txt");
  writeFile(repository, "image.bin", Buffer.from([0x89, 0x50, 0x00, 0x47]));
  writeFile(repository, "large.txt", `${"a".repeat(99)}\n`.repeat(100_001));

  await app.openPanel();
  await page.evaluate("navigator.clipboard.writeText('before')");
  await copyFrom(page, "UNTRACKED FILES (2)", "image.bin", "Copy file contents");
  await expect(page.getByText("image.bin is a binary file, so nothing was copied.")).toBeVisible();
  await copyFrom(page, "UNTRACKED FILES (2)", "large.txt", "Copy file contents");
  await expect(
    page.getByText("large.txt is larger than 10 MB, so nothing was copied."),
  ).toBeVisible();
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

// Commits `a.txt` as one line, then adds three after it, in one hunk.
function addThree(repository: string): void {
  writeFile(repository, "a.txt", "kept\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "kept\nalpha\nbravo\ncharlie\n");
}

// Right-clicks the line's text, and picks Copy from the menu of its file's lines.
async function copyLine(page: Page, path: string, text: string): Promise<void> {
  await line(page, text).click({ button: "right" });
  await page
    .getByRole("menu", { name: path })
    .getByRole("menuitem", { name: "Copy", exact: true })
    .click();
}

test("right-clicking a diff's lines opens a menu whose Copy copies the selected text, as copying it with the keyboard does", async ({
  app,
  page,
  repository,
}) => {
  addThree(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectLines(page, "bravo", "charlie");
  await page.keyboard.press("ControlOrMeta+C");
  await expect.poll(clipboardOf(page)).toBe("bravo\ncharlie");
  await page.evaluate("navigator.clipboard.writeText('before')");
  await copyLine(page, "a.txt", "bravo");

  await expect.poll(clipboardOf(page)).toBe("bravo\ncharlie");
  await expect(page.getByRole("menu")).toBeHidden();
});

test("the Copy of the bar a selection of a diff's lines shows copies the selected text, and leaves it selected", async ({
  app,
  page,
  repository,
}) => {
  addThree(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectLines(page, "bravo", "charlie");

  const bar = page.getByRole("toolbar", { name: "Selection", exact: true });

  await bar.getByRole("button", { name: "Copy", exact: true }).click();

  await expect.poll(clipboardOf(page)).toBe("bravo\ncharlie");
  await expect(bar).toBeHidden();
  expect(await page.evaluate("getSelection().toString()")).toBe("bravo\ncharlie");
  await expect(button(page, "Stage Lines")).toBeVisible();
});

test("the Copy of a diff's lines is disabled while no text is selected", async ({
  app,
  page,
  repository,
}) => {
  addThree(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  const copy = page
    .getByRole("menu", { name: "a.txt" })
    .getByRole("menuitem", { name: "Copy", exact: true });

  await page.getByText("4", { exact: true }).click({ button: "right" });
  await expect(copy).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(copy).toBeHidden();

  await selectLines(page, "kept");
  await line(page, "kept").click({ button: "right" });
  await expect(copy).toBeEnabled();
});

test("the menu key, or Shift+F10, opens the menu of the file whose row has focus, where ↓ and ↑ move between its items, Enter chooses one, and Escape closes it, and either way focus goes back to the row", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "before\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "contents\n");

  await app.openPanel();

  const menu = page.getByRole("menu", { name: "a.txt" });
  const file = page.getByRole("button", { name: "a.txt", exact: true });

  await file.focus();
  await page.keyboard.press("Shift+F10");

  await expect(page.getByRole("menuitem", { name: "Copy full path" })).toBeFocused();

  await page.keyboard.press("ArrowDown");

  await expect(page.getByRole("menuitem", { name: "Copy relative path" })).toBeFocused();

  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");

  await expect(page.getByRole("menuitem", { name: "Copy file contents" })).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(menu).toBeHidden();
  await expect.poll(clipboardOf(page)).toBe("contents\n");
  await expect(file).toBeFocused();

  await page.keyboard.press("ContextMenu");

  await expect(menu).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Copy full path" })).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(menu).toBeHidden();
  await expect(file).toBeFocused();
});
