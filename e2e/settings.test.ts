import type { Locator, Page } from "@playwright/test";

import { commitAll, writeFile } from "../test/repository";
import { changesSettings, expect, test as base } from "./fixtures";
import { line, openFile } from "./panel";

// Picks the diff font size on Better Diff's page in Paseo's settings, and waits for it to be saved.
async function pickDiffFontSize(page: Page, size: number): Promise<void> {
  await page.getByRole("button", { name: /^Diff font size: /u }).click();
  await page.getByRole("menuitem", { name: String(size), exact: true }).click();
  await expect(page.getByRole("button", { name: `Diff font size: ${size}` })).toBeEnabled();
}

// The settings are the host's, so each test puts back the defaults it may have changed.
const test = base.extend<Record<"defaultSettings", void>>({
  defaultSettings: [
    async ({ app, page }, provide) => {
      await provide();
      await app.pickDiffStyle("Auto");
      await app.saveLineLength(80);
      await pickDiffFontSize(page, 12);
    },
    { auto: true },
  ],
});

changesSettings();

// At the diff font size's default, 12 pixels, wide enough that every line length up to 80
// characters fits on each side, and narrow enough that none from 40 does.
const wide = { width: 1920, height: 720 };
const narrow = { width: 1280, height: 720 };

// Commits `a.txt`, then changes the line after an unchanged one.
function changeOne(repository: string): void {
  writeFile(repository, "a.txt", "kept\nold\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "kept\nnew\n");
}

test("Better Diff's page in Paseo's settings picks the diff style: Inline however wide the diff is, and Side by side however narrow", async ({
  app,
  page,
  repository,
}) => {
  changeOne(repository);

  await page.setViewportSize(wide);
  await app.pickDiffStyle("Inline");
  await app.saveLineLength(20);
  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(line(page, "new")).toBeVisible();
  await expect(line(page, "kept")).toHaveCount(1);

  await page.setViewportSize(narrow);
  await app.pickDiffStyle("Side by side");
  await app.saveLineLength(400);
  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(line(page, "kept")).toHaveCount(2);
});

test("Auto shows a diff side by side once lines of the line length set on Better Diff's page in Paseo's settings fit on each side", async ({
  app,
  page,
  repository,
}) => {
  changeOne(repository);

  await page.setViewportSize(narrow);
  await app.pickDiffStyle("Auto");
  await app.saveLineLength(30);
  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(line(page, "kept")).toHaveCount(2);

  await app.saveLineLength(80);
  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(line(page, "new")).toBeVisible();
  await expect(line(page, "kept")).toHaveCount(1);

  await page.setViewportSize(wide);

  await expect(line(page, "kept")).toHaveCount(2);
});

test("Auto needs more room for a line of the line length in a larger diff font size", async ({
  app,
  page,
  repository,
}) => {
  changeOne(repository);

  await page.setViewportSize(narrow);
  await app.saveLineLength(40);
  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(line(page, "new")).toBeVisible();
  await expect(line(page, "kept")).toHaveCount(1);

  await app.openSettings();
  await pickDiffFontSize(page, 9);
  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(line(page, "kept")).toHaveCount(2);
});

function lineLength(page: Page): Locator {
  return page.getByRole("textbox", { name: "Line length", exact: true });
}

function refusal(page: Page): Locator {
  return page.getByText("Enter a whole number from 20 to 400", { exact: true });
}

// Types the line length on Better Diff's page in Paseo's settings, which says it isn't one it takes.
async function refuses(page: Page, typed: string): Promise<void> {
  await lineLength(page).fill(typed);

  await expect(refusal(page)).toBeVisible();
}

test("a line length that isn't a whole number from 20 to 400 says so, and isn't saved", async ({
  app,
  page,
}) => {
  await app.saveLineLength(80);

  await expect(refusal(page)).toHaveCount(0);

  await refuses(page, "19");
  await refuses(page, "401");
  await refuses(page, "80.5");
  await refuses(page, "eighty");
  await refuses(page, "");
  await app.reopenSettings();

  await expect(lineLength(page)).toHaveValue("80");
});

test("a line length typed is saved once typing pauses, for every client of the host", async ({
  app,
  page,
}) => {
  await app.saveLineLength(80);

  const settings = page.url();

  await lineLength(page).fill("100");

  const other = await page.context().newPage();

  await expect(async () => {
    await other.goto(settings);
    expect(await lineLength(other).inputValue()).toBe("100");
  }).toPass();
  await other.close();
});
