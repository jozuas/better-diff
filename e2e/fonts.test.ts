import type { Locator, Page } from "@playwright/test";

import { writeFile } from "../test/repository";
import { changesSettings, expect, test as base } from "./fixtures";
import { box, button, line, openFile, row } from "./panel";
import { changeA, comment, editor, openReview, pending, startComment } from "./review";

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

// The element's size on the page, for expect.poll.
function sizeOf(locator: Locator): () => Promise<{ width: number; height: number }> {
  return async () => {
    const { width, height } = await box(locator);

    return { width, height };
  };
}

// The sizes are the host's, so each test puts back the defaults it may have changed.
const test = base.extend<Record<"defaultSizes", void>>({
  defaultSizes: [
    async ({ app, page }, provide) => {
      await provide();
      await app.openSettings();
      await choose(page, "Diff font size", 13);
      await choose(page, "Panel font size", 13);
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

test("Better Diff's font sizes start at 13, for the diff and the rest of the panel", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "alpha\n");

  await app.openSettings();

  await expect(page.getByRole("button", { name: "Diff font size: 13" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Panel font size: 13" })).toBeVisible();

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", "a.txt");

  await expect(line(page, "alpha")).toHaveCSS("font-size", "13px");
  await expect(line(page, "alpha")).toHaveCSS("line-height", "20px");
  await expect(path(page, "a.txt")).toHaveCSS("font-size", "13px");
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
  await expect(path(page, "a.txt")).toHaveCSS("font-size", "13px");
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
  await expect(line(page, "alpha")).toHaveCSS("font-size", "13px");
});

test("buttons, the sidebar's rows and menus' items scale with the panel font size, roomier than Paseo's own, as Linear sizes its", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "alpha\n");

  await app.openSettings();
  await choose(page, "Panel font size", 18);
  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", "a.txt");

  await expect.poll(sizeOf(button(page, "Stage"))).toMatchObject({ height: 36 });
  await expect.poll(sizeOf(button(page, "Stage a.txt"))).toStrictEqual({ width: 36, height: 36 });
  await expect.poll(sizeOf(button(page, "a.txt"))).toMatchObject({ height: 41 });

  await button(page, "a.txt").click({ button: "right" });

  await expect
    .poll(sizeOf(page.getByRole("menuitem", { name: "Copy full path" })))
    .toMatchObject({ height: 41 });
});

test("a line's comment button, a comment's Pending mark and a file's count of comments scale with the font sizes, as buttons do", async ({
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openSettings();
  await choose(page, "Diff font size", 16);
  await choose(page, "Panel font size", 18);
  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await line(page, "BRAVO").hover();

  await expect
    .poll(sizeOf(button(page, "Add review comment")))
    .toStrictEqual({ width: 24, height: 24 });
  await expect
    .poll(sizeOf(button(page, "Add review comment").locator("svg")))
    .toStrictEqual({ width: 18, height: 18 });

  await comment(page, "BRAVO", "Why?");

  const count = row(page, "MODIFIED FILES (1)", "a.txt").getByLabel("1 pending comment", {
    exact: true,
  });

  await expect(pending(page, "Why?").getByText("Pending", { exact: true })).toHaveCSS(
    "font-size",
    "15px",
  );
  await expect(count.getByText("1", { exact: true })).toHaveCSS("font-size", "18px");
  await expect.poll(sizeOf(count.locator("svg"))).toStrictEqual({ width: 21, height: 21 });
});

test("what a comment says scales with the diff font size, a little larger than the lines, under its line, in the review and while it's written", async ({
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openSettings();
  await choose(page, "Diff font size", 16);
  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await startComment(page, "BRAVO");

  await expect(editor(page)).toHaveCSS("font-size", "17px");

  await editor(page).fill("Why?");
  await button(page, "Save review comment").click();

  await expect(pending(page, "Why?").getByText("Why?", { exact: true })).toHaveCSS(
    "font-size",
    "17px",
  );

  const opened = await openReview(page, 1);

  await expect(pending(opened, "Why?").getByText("Why?", { exact: true })).toHaveCSS(
    "font-size",
    "17px",
  );
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
  await expect(line(page, "alpha")).toHaveCSS("font-size", "13px");

  const other = await page.context().newPage();

  await other.goto(settings);
  await choose(other, "Diff font size", 16);
  await other.close();

  await expect(line(page, "alpha")).toHaveCSS("font-size", "16px");
});
