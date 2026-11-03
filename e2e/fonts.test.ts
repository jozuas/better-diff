import type { Locator, Page } from "@playwright/test";

import { writeFile } from "../test/repository";
import { changesSettings, expect, test as base } from "./fixtures";
import { box, button, line, openFile } from "./panel";

type Setting = "Diff font size" | "Panel font size";

// Chooses the size on Better Diff's page in Paseo's settings, and waits for it to be saved.
async function choose(page: Page, setting: Setting, size: number): Promise<void> {
  await page.getByRole("button", { name: new RegExp(`^${setting}: `, "u") }).click();
  await page.getByRole("menuitem", { name: String(size), exact: true }).click();
  await expect(page.getByRole("button", { name: `${setting}: ${size}` })).toBeEnabled();
}

// A file's path in its row in the sidebar.
function path(page: Page, name: string): Locator {
  return button(page, name).getByText(name, { exact: true });
}

// The sizes are the host's, so each test puts back the defaults it may have changed.
const test = base.extend<Record<"defaultSizes", void>>({
  defaultSizes: [
    async ({ app, page }, provide) => {
      await provide();
      await app.openSettings();
      await choose(page, "Diff font size", 12);
      await choose(page, "Panel font size", 14);
    },
    { auto: true },
  ],
});

changesSettings();

test("Better Diff's page in Paseo's settings says, by its font sizes' heading, that Paseo's own sizes don't change Better Diff, while zooming Paseo does", async ({
  app,
  page,
}) => {
  await app.openSettings();
  await page.getByRole("button", { name: "About Font sizes", exact: true }).hover();

  await expect(
    page.getByText(
      "Paseo's own font sizes, under Appearance, don't change Better Diff. Zooming Paseo in or out scales Better Diff with it",
      { exact: true },
    ),
  ).toBeVisible();
});

test("Better Diff's font sizes start at Paseo's defaults: 12 for the diff and 14 for the rest of the panel", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "alpha\n");

  await app.openSettings();

  await expect(page.getByRole("button", { name: "Diff font size: 12" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Panel font size: 14" })).toBeVisible();

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", "a.txt");

  await expect(line(page, "alpha")).toHaveCSS("font-size", "12px");
  await expect(line(page, "alpha")).toHaveCSS("line-height", "18px");
  await expect(path(page, "a.txt")).toHaveCSS("font-size", "14px");
});

test("the diff font size sets the size of the diff's lines and their numbers, each line half as tall again", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "alpha\n");

  await app.openSettings();
  await choose(page, "Diff font size", 16);
  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", "a.txt");

  await expect(line(page, "alpha")).toHaveCSS("font-size", "16px");
  await expect(line(page, "alpha")).toHaveCSS("line-height", "24px");
  await expect(line(page, "1")).toHaveCSS("font-size", "16px");
  await expect(path(page, "a.txt")).toHaveCSS("font-size", "14px");
});

test("the panel font size sets the size of the rest of the panel, its smaller text and the files' icons scaled with it", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "alpha\n");

  await app.openSettings();
  await choose(page, "Panel font size", 18);
  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", "a.txt");

  await expect(path(page, "a.txt")).toHaveCSS("font-size", "18px");
  await expect(page.getByRole("textbox", { name: "Filter files" })).toHaveCSS("font-size", "18px");
  await expect(page.getByText("Stage", { exact: true })).toHaveCSS("font-size", "15px");
  await expect(page.getByRole("heading", { name: "UNTRACKED FILES (1)" })).toHaveCSS(
    "font-size",
    "14px",
  );
  await expect
    .poll(async () => {
      const icon = await box(button(page, "a.txt").locator("svg[xml]"));

      return icon;
    })
    .toMatchObject({ width: 21, height: 21 });
  await expect(line(page, "alpha")).toHaveCSS("font-size", "12px");
});

test("a size chosen on one client of the host shows at once in a Better Diff panel open on another", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "alpha\n");

  await app.openSettings();

  const settings = page.url();

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", "a.txt");
  await expect(line(page, "alpha")).toHaveCSS("font-size", "12px");

  const other = await page.context().newPage();

  await other.goto(settings);
  await choose(other, "Diff font size", 16);
  await other.close();

  await expect(line(page, "alpha")).toHaveCSS("font-size", "16px");
});
