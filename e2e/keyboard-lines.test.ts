import type { Page } from "@playwright/test";

import { commitAll, worktreeFile, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { changeTwoHunks, changeTwoTallHunks, fileBar, hunkBar, staged } from "./keyboard";
import { button, line, openFile, selectLines } from "./panel";

// Commits `a.txt` as lines 1 to 5, then replaces its third line with two others.
function replaceThird(repository: string): void {
  writeFile(repository, "a.txt", "1\n2\n3\n4\n5\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "1\n2\nx\ny\n4\n5\n");
}

// Reads the text the page's selection has, each time it's called, each line of it trimmed, as the
// lines it selects say.
function selectionOf(page: Page): () => Promise<string[]> {
  return async () =>
    String(await page.evaluate("String(getSelection())"))
      .split("\n")
      .map((part) => part.trim())
      .filter((part) => part !== "");
}

// Presses the key the number of times, one after another.
async function pressTimes(page: Page, key: string, times: number): Promise<void> {
  if (times > 0) {
    await page.keyboard.press(key);
    await pressTimes(page, key, times - 1);
  }
}

test("→ in a hunk's bar selects the hunk's first changed line, ↓ and ↑ then select the next line or the one before, and Enter stages the selected lines", async ({
  app,
  page,
  repository,
}) => {
  replaceThird(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await hunkBar(page, "a.txt").focus();
  await page.keyboard.press("ArrowRight");

  await expect.poll(selectionOf(page)).toStrictEqual(["3"]);
  await expect(button(page, "Stage Lines")).toBeVisible();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");

  await expect.poll(selectionOf(page)).toStrictEqual(["x"]);

  await page.keyboard.press("Enter");

  await expect.poll(() => staged(repository)).toContain("+x\n");
  expect(staged(repository)).not.toContain("+y");
  expect(staged(repository)).not.toContain("-3");
  await expect(hunkBar(page, "a.txt")).toBeFocused();
});

test("Shift+↓ and Shift+↑ select one more line or one fewer, and Backspace discards the selected lines once pressed again to confirm", async ({
  app,
  page,
  repository,
}) => {
  replaceThird(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await hunkBar(page, "a.txt").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowUp");

  await expect.poll(selectionOf(page)).toStrictEqual(["3", "x"]);

  await page.keyboard.press("Backspace");

  await expect(button(page, "Confirm discard?")).toBeVisible();

  await page.keyboard.press("Backspace");

  await expect.poll(() => worktreeFile(repository, "a.txt")?.toString()).toBe("1\n2\n3\ny\n4\n5\n");
});

test("↓ past a hunk's last line selects the next hunk's first line, and Escape clears the selection, leaving focus in the hunk's bar", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await hunkBar(page, "a.txt").focus();
  await page.keyboard.press("ArrowRight");

  await pressTimes(page, "ArrowDown", 5);

  await expect.poll(selectionOf(page)).toStrictEqual(["6"]);
  await expect(hunkBar(page, "a.txt", 2)).toBeFocused();

  await page.keyboard.press("Escape");

  await expect.poll(selectionOf(page)).toStrictEqual([]);
  await expect(button(page, "Stage Lines")).toBeHidden();
  await expect(hunkBar(page, "a.txt", 2)).toBeFocused();
});

test("the view scrolls to show the line the selection moves to", async ({
  app,
  page,
  repository,
}) => {
  changeTwoTallHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await hunkBar(page, "a.txt").focus();
  await page.keyboard.press("ArrowRight");

  await pressTimes(page, "ArrowDown", 35);

  await expect.poll(selectionOf(page)).toStrictEqual(["first 36"]);
  await expect(line(page, "first 36")).toBeInViewport();
});

test("selecting lines with the pointer moves focus to their hunk's bar, so Enter stages them", async ({
  app,
  page,
  repository,
}) => {
  replaceThird(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectLines(page, "y");

  await expect(hunkBar(page, "a.txt")).toBeFocused();

  await page.keyboard.press("Enter");

  await expect.poll(() => staged(repository)).toContain("+y\n");
  expect(staged(repository)).not.toContain("+x");
});

test("pressing the pointer on a hunk's lines moves focus to the hunk's bar once it's let go, so Enter stages the hunk", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await page.getByRole("textbox", { name: "Filter files" }).focus();
  await line(page, "last").click();

  await expect(hunkBar(page, "a.txt", 2)).toBeFocused();

  await page.keyboard.press("Enter");

  await expect.poll(() => staged(repository)).toContain("+last\n");
  expect(staged(repository)).not.toContain("+first");
});

test("once the pointer clears the lines keys selected, the keys in their hunk's bar act on the hunk again", async ({
  app,
  page,
  repository,
}) => {
  replaceThird(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await hunkBar(page, "a.txt").focus();
  await page.keyboard.press("ArrowRight");

  await expect.poll(selectionOf(page)).toStrictEqual(["3"]);

  await fileBar(page, "MODIFIED a.txt").click({ position: { x: 20, y: 4 } });

  await expect.poll(selectionOf(page)).toStrictEqual([]);

  await page.keyboard.press("ArrowDown");

  await expect(hunkBar(page, "a.txt")).toBeFocused();

  await page.keyboard.press("Enter");

  await expect.poll(() => staged(repository)).toContain("-3\n+x\n+y\n");
});
