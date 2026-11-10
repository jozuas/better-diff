import type { Locator, Page } from "@playwright/test";

import { runGit, worktreeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { changeTwoHunks, hunkBar, staged } from "./keyboard";
import { box, line, openFile, selectLines } from "./panel";

function selectionBar(page: Page): Locator {
  return page.getByRole("toolbar", { name: "Selection", exact: true });
}

// What the file at the path in the worktree says.
function inWorktree(repository: string, path: string): () => string {
  return () => String(worktreeFile(repository, path));
}

// Where the bar's bottom is on the page, each time it's called, which it's placed by once it knows
// how tall it is.
function barBottom(page: Page): () => Promise<number> {
  return async () => {
    const shown = await box(selectionBar(page));

    return shown.y + shown.height;
  };
}

function barButton(page: Page, name: string): Locator {
  return selectionBar(page).getByRole("button", { name, exact: true });
}

test("the bar over lines selected with the pointer has their actions, and the hunk's bar has none, and Stage Lines stages them", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectLines(page, "first");

  await expect(hunkBar(page, "a.txt").getByRole("button", { name: /Lines$/u })).toHaveCount(0);

  await barButton(page, "Stage Lines").click();

  await expect.poll(() => staged(repository)).toContain("+first\n");
  expect(staged(repository)).not.toContain("+last");
  await expect(selectionBar(page)).toBeHidden();
});

test("the bar's Discard Lines discards the selected lines once pressed again", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectLines(page, "last");
  await barButton(page, "Discard Lines").click();

  await expect(barButton(page, "Confirm discard?")).toBeVisible();
  expect(inWorktree(repository, "a.txt")()).toContain("last\n");

  await barButton(page, "Confirm discard?").click();

  await expect.poll(inWorktree(repository, "a.txt")).not.toContain("last");
  expect(inWorktree(repository, "a.txt")()).toContain("first\n");
});

test("the bar over staged lines has Unstage Lines, which unstages them", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);
  runGit(repository, ["add", "a.txt"]);

  await app.openPanel();
  await openFile(page, "STAGED FILES (1)", "a.txt");
  await selectLines(page, "last");

  await expect(barButton(page, "Discard Lines")).toHaveCount(0);

  await barButton(page, "Unstage Lines").click();

  await expect.poll(() => staged(repository)).not.toContain("+last");
  expect(staged(repository)).toContain("+first\n");
});

test("lines the keyboard selects show the bar just above the start of the line the selection reaches, which moves along with it, and Backspace's question shows in it", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await hunkBar(page, "a.txt", 2).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");

  const reached = await box(line(page, "last"));

  await expect.poll(barBottom(page)).toBeLessThan(reached.y + reached.height / 2);

  const shown = await box(selectionBar(page));

  expect(Math.abs(shown.x - reached.x)).toBeLessThan(20);

  await page.keyboard.press("ArrowUp");

  await expect.poll(barBottom(page)).toBeLessThan(shown.y + shown.height);

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Backspace");

  await expect(barButton(page, "Confirm discard?")).toBeVisible();

  await page.keyboard.press("Backspace");

  await expect.poll(inWorktree(repository, "a.txt")).not.toContain("last");
  await expect(selectionBar(page)).toBeHidden();
});

test("a selection let go of past the hunk whose lines it selects shows the bar over that hunk's lines, with their actions", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectLines(page, "first", "last");

  await expect(selectionBar(page)).toHaveCount(1);

  const second = await box(hunkBar(page, "a.txt", 2));

  await expect.poll(barBottom(page)).toBeLessThanOrEqual(second.y);

  await barButton(page, "Stage Lines").click();

  await expect.poll(() => staged(repository)).toContain("+first\n");
  expect(staged(repository)).not.toContain("+last");
});

function linesMenu(page: Page): Locator {
  return page.getByRole("menu", { name: "a.txt", exact: true });
}

test("the menu of selected lines has their actions, then a line, then Comment and Copy, and its Stage Lines stages them", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectLines(page, "first");
  await line(page, "first").click({ button: "right" });

  await expect(linesMenu(page).getByRole("menuitem")).toHaveText([
    "Discard Lines",
    "Stage Lines",
    "Comment",
    "Copy",
  ]);
  await expect(linesMenu(page).getByRole("separator")).toHaveCount(1);

  await linesMenu(page).getByRole("menuitem", { name: "Stage Lines", exact: true }).click();

  await expect(linesMenu(page)).toBeHidden();
  await expect.poll(() => staged(repository)).toContain("+first\n");
  expect(staged(repository)).not.toContain("+last");
});

test("the menu's Discard Lines asks for confirmation in its place, with the menu open, and discards the selected lines once chosen again", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectLines(page, "last");
  await line(page, "last").click({ button: "right" });
  await linesMenu(page).getByRole("menuitem", { name: "Discard Lines", exact: true }).click();

  const confirm = linesMenu(page).getByRole("menuitem", { name: "Confirm discard?", exact: true });

  await expect(confirm).toBeVisible();
  await expect(barButton(page, "Confirm discard?")).toHaveCount(1);
  expect(inWorktree(repository, "a.txt")()).toContain("last\n");

  await confirm.click();

  await expect(linesMenu(page)).toBeHidden();
  await expect.poll(inWorktree(repository, "a.txt")).not.toContain("last");
  expect(inWorktree(repository, "a.txt")()).toContain("first\n");
});

test("with none of their hunk's lines selected, the menu of a diff's lines has only Comment and Copy", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await line(page, "first").click({ button: "right" });

  await expect(linesMenu(page).getByRole("menuitem")).toHaveText(["Comment", "Copy"]);
  await expect(linesMenu(page).getByRole("separator")).toHaveCount(0);
});
