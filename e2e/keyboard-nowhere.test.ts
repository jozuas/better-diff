import type { Page } from "@playwright/test";

import { commitAll, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { heading, hunkBar, writeLong } from "./keyboard";
import { box, button, line } from "./panel";

// Presses the pointer on the strip of keys along the bottom of the panel, which takes no focus of
// its own, so focus is then on the panel itself.
async function pressStrip(page: Page): Promise<void> {
  await page.getByRole("note", { name: "Keys", exact: true }).click();
}

test("an arrow with focus nowhere in the panel that keys act on, as after a press on empty space in it, moves focus to the open file's row", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");

  await app.openPanel();
  await expect(button(page, "a.txt")).toBeFocused();

  await pressStrip(page);
  await expect(button(page, "a.txt")).not.toBeFocused();
  await page.keyboard.press("ArrowUp");

  await expect(button(page, "a.txt")).toBeFocused();

  await pressStrip(page);
  await page.keyboard.press("ArrowRight");

  await expect(button(page, "a.txt")).toBeFocused();

  await pressStrip(page);
  await page.keyboard.press("ArrowLeft");

  await expect(button(page, "a.txt")).toBeFocused();

  const strip = await box(page.getByRole("note", { name: "Keys", exact: true }));

  await page.mouse.click(strip.x + strip.width - 40, strip.y - 40);
  await expect(button(page, "a.txt")).not.toBeFocused();
  await page.keyboard.press("ArrowDown");

  await expect(button(page, "a.txt")).toBeFocused();
});

test("an arrow with focus nowhere in the panel moves it to the open group's heading, to the open file's group's heading while the group is collapsed, and with nothing open, to the filter", async ({
  app,
  page,
  repository,
}) => {
  await app.openPanel();
  await expect(heading(page, "MODIFIED FILES (0)")).toBeVisible();
  await pressStrip(page);
  await page.keyboard.press("ArrowDown");

  await expect(page.getByRole("textbox", { name: "Filter files" })).toBeFocused();

  writeFile(repository, "a.txt", "a\n");
  await heading(page, "UNTRACKED FILES (1)").click();
  await pressStrip(page);
  await page.keyboard.press("ArrowDown");

  await expect(heading(page, "UNTRACKED FILES (1)")).toBeFocused();

  await button(page, "a.txt").click();
  await button(page, "UNTRACKED FILES").click();
  await expect(button(page, "a.txt")).toBeHidden();
  await pressStrip(page);
  await page.keyboard.press("ArrowDown");

  await expect(heading(page, "UNTRACKED FILES (1)")).toBeFocused();
});

test("← from a bar of a file whose group is collapsed moves focus to the group's heading", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");

  await app.openPanel();
  await expect(button(page, "a.txt")).toBeFocused();
  await expect(line(page, "a")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(hunkBar(page, "a.txt")).toBeFocused();
  await button(page, "UNTRACKED FILES").click();
  await hunkBar(page, "a.txt").focus();
  await page.keyboard.press("ArrowLeft");

  await expect(heading(page, "UNTRACKED FILES (1)")).toBeFocused();
});

test("Tab from the file list doesn't stop at a diff taller than the view, which a browser has Tab reach as it scrolls", async ({
  app,
  page,
  repository,
}) => {
  writeLong(repository, "a.txt", "a");
  commitAll(repository);
  writeLong(repository, "a.txt", "b");

  await app.openPanel();
  await expect(button(page, "a.txt")).toBeFocused();
  await expect(hunkBar(page, "a.txt")).toBeVisible();
  await page.keyboard.press("Tab");
  await page.keyboard.press("ArrowDown");

  await expect(button(page, "a.txt")).not.toBeFocused();
  await expect(hunkBar(page, "a.txt")).not.toBeFocused();
  expect(
    await page.evaluate(
      `document.querySelector('[aria-label="Filter files"]').closest('[tabindex="-1"]:has([role="note"])').contains(document.activeElement)`,
    ),
  ).toBe(false);
});
