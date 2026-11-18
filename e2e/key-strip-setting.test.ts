import type { Locator, Page } from "@playwright/test";

import { writeFile } from "../test/repository";
import { changesSettings, expect, test as base } from "./fixtures";
import { button } from "./panel";

// The switch on Better Diff's page in Paseo's settings.
function showing(page: Page): Locator {
  return page.getByRole("switch", { name: "Show keys", exact: true });
}

function strip(page: Page): Locator {
  return page.getByRole("note", { name: "Keys", exact: true });
}

// Whether the strip shows is the host's setting, so each test shows it again.
const test = base.extend<Record<"shownKeys", void>>({
  shownKeys: [
    async ({ app, page }, provide) => {
      await provide();
      await app.openSettings();
      await showing(page).setChecked(true);
      await expect(showing(page)).toBeChecked();
    },
    { auto: true },
  ],
});

changesSettings();

test("Show keys in Better Diff's settings, on by default, takes the strip of keys away and shows it again, and a Better Diff panel open on another client of the host follows it at once", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");

  await app.openSettings();

  await expect(showing(page)).toBeChecked();

  const settings = page.url();

  await app.openPanel();
  await expect(button(page, "a.txt")).toBeFocused();

  await expect(strip(page).getByText(/Stage$/u)).toBeVisible();

  const other = await page.context().newPage();

  await other.goto(settings);
  await showing(other).click();
  await expect(showing(other)).not.toBeChecked();

  await expect(strip(page)).toHaveCount(0);
  await expect(button(page, "a.txt")).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(button(page, "Unstage a.txt")).toBeVisible();

  await showing(other).click();
  await expect(showing(other)).toBeChecked();

  await expect(strip(page).getByText(/Unstage$/u)).toBeVisible();

  await other.close();
});
