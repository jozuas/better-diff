import type { Locator } from "@playwright/test";

import { commitAll, runGit, worktreeFile, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { box, button, group, line, openFile, row } from "./panel";

// Commits `a.txt` and `b.txt`, then changes both.
function changeTwo(repository: string): void {
  writeFile(repository, "a.txt", "a\n");
  writeFile(repository, "b.txt", "b\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "changed a\n");
  writeFile(repository, "b.txt", "changed b\n");
}

function status(repository: string): string {
  return runGit(repository, ["status", "--porcelain", "--untracked-files=all"]);
}

test("a file's actions show at the end of its row while the pointer is over it, and always on the open file's", async ({
  app,
  page,
  repository,
}) => {
  changeTwo(repository);

  await app.openPanel();
  await expect(button(page, "Stage a.txt")).toHaveCSS("opacity", "0");
  await row(page, "MODIFIED FILES (2)", "a.txt").hover();
  await expect(button(page, "Stage a.txt")).toHaveCSS("opacity", "1");
  await openFile(page, "MODIFIED FILES (2)", "b.txt");
  await page.mouse.move(0, 0);

  await expect(button(page, "Stage a.txt")).toHaveCSS("opacity", "0");
  await expect(button(page, "Discard b.txt")).toHaveCSS("opacity", "1");
});

test("a file's actions show while focus is in its row, so the keyboard reaches them", async ({
  app,
  page,
  repository,
}) => {
  changeTwo(repository);

  await app.openPanel();
  await page.getByRole("button", { name: "a.txt", exact: true }).focus();
  await page.keyboard.press("Tab");

  await expect(button(page, "Discard a.txt")).toBeFocused();
  await expect(button(page, "Discard a.txt")).toHaveCSS("opacity", "1");
});

test("staging a file from its row stages all its changes, and leaves the open file open", async ({
  app,
  page,
  repository,
}) => {
  changeTwo(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "b.txt");
  await row(page, "MODIFIED FILES (2)", "a.txt").hover();
  await button(page, "Stage a.txt").click();

  await expect(group(page, "STAGED FILES (1)")).toHaveText(["a.txt"]);
  await expect(line(page, "changed b")).toBeVisible();
  expect(status(repository)).toBe("M  a.txt\n M b.txt\n");
});

test('discarding a file from its row asks "Confirm discard?" first, then restores it', async ({
  app,
  page,
  repository,
}) => {
  changeTwo(repository);

  await app.openPanel();
  await row(page, "MODIFIED FILES (2)", "a.txt").hover();
  await button(page, "Discard a.txt").click();
  await expect(button(page, "Confirm discard?")).toBeVisible();

  expect(worktreeFile(repository, "a.txt")?.toString()).toBe("changed a\n");

  await button(page, "Confirm discard?").click();

  await expect(group(page, "MODIFIED FILES (1)")).toHaveText(["b.txt"]);
  expect(status(repository)).toBe(" M b.txt\n");
});

test('deleting an untracked file from its row asks "Confirm delete?" first, then deletes it, and unstaging a staged one unstages it', async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "new.txt", "new\n");
  writeFile(repository, "staged.txt", "staged\n");
  runGit(repository, ["add", "staged.txt"]);

  await app.openPanel();
  await row(page, "UNTRACKED FILES (1)", "new.txt").hover();
  await button(page, "Delete new.txt").click();
  await button(page, "Confirm delete?").click();
  await expect(page.getByRole("heading", { name: "UNTRACKED FILES (0)" })).toBeVisible();
  await row(page, "STAGED FILES (1)", "staged.txt").hover();
  await button(page, "Unstage staged.txt").click();

  await expect(group(page, "UNTRACKED FILES (1)")).toHaveText(["staged.txt"]);
  expect(status(repository)).toBe("?? staged.txt\n");
});

test("an action from the open file's row on a diff that changed since it was shown changes nothing, and says so", async ({
  app,
  page,
  repository,
}) => {
  changeTwo(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");
  await expect(line(page, "changed a")).toBeVisible();

  writeFile(repository, "a.txt", "changed again\n");
  await button(page, "Stage a.txt").click();

  await expect(
    page.getByText(/^The diff changed after it was shown, so nothing was done\./u),
  ).toBeVisible();
  await expect(line(page, "changed again")).toBeVisible();
  expect(status(repository)).toBe(" M a.txt\n M b.txt\n");
});

test("Stage All on a group's heading stages all its files, and Unstage All on the staged files' heading unstages them", async ({
  app,
  page,
  repository,
}) => {
  changeTwo(repository);

  await app.openPanel();
  await page.getByRole("heading", { name: "MODIFIED FILES (2)" }).hover();
  await button(page, "Stage All").click();
  await expect(group(page, "STAGED FILES (2)")).toHaveText(["a.txt", "b.txt"]);

  expect(status(repository)).toBe("M  a.txt\nM  b.txt\n");

  await page.getByRole("heading", { name: "STAGED FILES (2)" }).hover();
  await button(page, "Unstage All").click();

  await expect(group(page, "MODIFIED FILES (2)")).toHaveText(["a.txt", "b.txt"]);
  expect(status(repository)).toBe(" M a.txt\n M b.txt\n");
});

test('Discard All asks "Confirm discard?" first, then discards all the modified files, and Delete All asks "Confirm delete?", then deletes all the untracked ones', async ({
  app,
  page,
  repository,
}) => {
  changeTwo(repository);
  writeFile(repository, "new.txt", "new\n");
  writeFile(repository, "src/new.ts", "new\n");

  await app.openPanel();
  await page.getByRole("heading", { name: "MODIFIED FILES (2)" }).hover();
  await button(page, "Discard All").click();
  await button(page, "Confirm discard?").click();
  await expect(page.getByRole("heading", { name: "MODIFIED FILES (0)" })).toBeVisible();
  await page.getByRole("heading", { name: "UNTRACKED FILES (2)" }).hover();
  await button(page, "Delete All").click();
  await button(page, "Confirm delete?").click();

  await expect(page.getByRole("heading", { name: "UNTRACKED FILES (0)" })).toBeVisible();
  expect(status(repository)).toBe("");
});

test("a group's actions are left out while the filter hides some of its files", async ({
  app,
  page,
  repository,
}) => {
  changeTwo(repository);
  writeFile(repository, "new-a.txt", "new\n");

  await app.openPanel();
  await page.getByRole("textbox", { name: "Filter files" }).pressSequentially("a.txt");
  await page.getByRole("heading", { name: "MODIFIED FILES (1 of 2)" }).hover();

  await expect(button(page, "Discard All")).toHaveCount(0);
  await expect(button(page, "Delete All")).toHaveCount(1);
  await expect(button(page, "Stage All")).toHaveCount(1);
});

test("an action on all of a group's files changes nothing once a file has joined the group since it was listed, and says so", async ({
  app,
  page,
  repository,
}) => {
  changeTwo(repository);
  runGit(repository, ["add", "b.txt"]);

  await app.openPanel();
  await expect(group(page, "MODIFIED FILES (1)")).toHaveText(["a.txt"]);

  writeFile(repository, "b.txt", "changed b again\n");
  await page.getByRole("heading", { name: "MODIFIED FILES (1)" }).hover();
  await button(page, "Stage All").click();

  await expect(
    page.getByText(/^The group's files changed after they were listed, so nothing was done\./u),
  ).toBeVisible();
  await expect(group(page, "MODIFIED FILES (2)")).toHaveText(["a.txt", "b.txt"]);
  expect(status(repository)).toBe(" M a.txt\nMM b.txt\n");
});

// Whether the triangle in the button points right or down, by its shape on the page.
async function pointing(toggle: Locator): Promise<"right" | "down"> {
  const { width, height } = await box(toggle.locator("div"));

  return width < height ? "right" : "down";
}

test("a triangle left of each group's heading collapses the group, hiding its files, and expands it again", async ({
  app,
  page,
  repository,
}) => {
  changeTwo(repository);
  writeFile(repository, "c.txt", "c\n");

  await app.openPanel();
  const modified = button(page, "MODIFIED FILES");

  await expect(group(page, "MODIFIED FILES (2)")).toHaveText(["a.txt", "b.txt"]);
  await expect(page.getByRole("button", { name: "MODIFIED FILES", expanded: true })).toBeVisible();
  expect(await pointing(modified)).toBe("down");

  await modified.click();

  await expect(group(page, "MODIFIED FILES (2)")).toHaveCount(0);
  await expect(group(page, "UNTRACKED FILES (1)")).toHaveText(["c.txt"]);
  await expect(page.getByRole("button", { name: "MODIFIED FILES", expanded: false })).toBeVisible();
  expect(await pointing(modified)).toBe("right");

  await modified.click();

  await expect(group(page, "MODIFIED FILES (2)")).toHaveText(["a.txt", "b.txt"]);
  expect(await pointing(modified)).toBe("down");
  expect(status(repository)).toBe(" M a.txt\n M b.txt\n?? c.txt\n");
});
