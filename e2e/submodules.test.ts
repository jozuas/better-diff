import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Page } from "@playwright/test";

import { commitAll, runGit, writeFile } from "../test/repository";
import { nestRepository, submodule } from "../test/submodules";
import { expect, test } from "./fixtures";
import { fileBar, status } from "./keyboard";
import { button, group, openFile, row } from "./panel";

// Adds the submodule `sub`, with the file `s`, from a repository in the git directory, where git
// status never looks, commits it, and returns its directory.
function addSubmodule(repository: string): string {
  const source = join(repository, ".git", "source");

  runGit(repository, ["init", "--quiet", source]);
  writeFile(source, "s", "s\n");
  commitAll(source);
  submodule(repository, ["add", "--quiet", source, "sub"]);
  commitAll(repository);

  return join(repository, "sub");
}

// Moves the submodule on to a commit of its own.
function moveOn(sub: string, content: string): void {
  writeFile(sub, "s", content);
  commitAll(sub);
}

// Presses the keys that run a file's actions, with focus on the file's bar and then on its row.
async function pressFileKeys(page: Page, bar: string, heading: string): Promise<void> {
  await fileBar(page, bar).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Shift+Backspace");

  await row(page, heading, "sub").getByRole("button", { name: "sub", exact: true }).focus();
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.press("Shift+Backspace");
}

test('a submodule is listed in MODIFIED once its commit or its files change, and in STAGED once its commit change is staged, showing "Submodule" instead of the diff, or "Submodule\'s files changed" while only its files changed', async ({
  app,
  page,
  repository,
}) => {
  const sub = addSubmodule(repository);

  writeFile(sub, "s", "t\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "sub");

  await expect(page.getByText("Submodule's files changed", { exact: true })).toBeVisible();

  commitAll(sub);

  await expect(page.getByText("Submodule", { exact: true })).toBeVisible();

  runGit(repository, ["add", "sub"]);

  await expect(group(page, "STAGED FILES (1)")).toHaveText(["sub"]);

  await openFile(page, "STAGED FILES (1)", "sub");

  await expect(page.getByText("Submodule", { exact: true })).toBeVisible();
  expect(status(repository)).toBe("M  sub\n");
});

test("a submodule's commit change is staged and unstaged whole from its file bar and row, which their keys run, and has no Discard, Backspace doing nothing there", async ({
  app,
  page,
  repository,
}) => {
  const sub = addSubmodule(repository);

  moveOn(sub, "t\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "sub");

  await expect(fileBar(page, "MODIFIED sub").getByRole("button")).toHaveCount(1);
  await expect(fileBar(page, "MODIFIED sub").getByRole("button", { name: "Stage" })).toHaveCount(1);
  await expect(row(page, "MODIFIED FILES (1)", "sub").getByRole("button")).toHaveCount(2);

  await fileBar(page, "MODIFIED sub").focus();
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Shift+Backspace");
  await row(page, "MODIFIED FILES (1)", "sub")
    .getByRole("button", { name: "sub", exact: true })
    .focus();
  await page.keyboard.press("Shift+Backspace");

  await expect(button(page, "Confirm discard?")).toHaveCount(0);

  await fileBar(page, "MODIFIED sub").focus();
  await page.keyboard.press("Enter");

  await expect(group(page, "STAGED FILES (1)")).toHaveText(["sub"]);
  expect(status(repository)).toBe("M  sub\n");
  expect(readFileSync(join(sub, "s"), "utf8")).toBe("t\n");

  await row(page, "STAGED FILES (1)", "sub").hover();
  await button(page, "Unstage sub").click();

  await expect(group(page, "MODIFIED FILES (1)")).toHaveText(["sub"]);
  expect(status(repository)).toBe(" M sub\n");
});

test("staging or unstaging a submodule's group or the files selected includes its commit change, and discarding them leaves it out", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");
  writeFile(repository, "b.txt", "b\n");

  const sub = addSubmodule(repository);

  moveOn(sub, "t\n");

  const head = runGit(sub, ["rev-parse", "HEAD"]);

  writeFile(repository, "a.txt", "changed a\n");
  writeFile(repository, "b.txt", "changed b\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (3)", "b.txt");
  await row(page, "MODIFIED FILES (3)", "sub")
    .getByRole("button", { name: "sub", exact: true })
    .click({ modifiers: ["Shift"] });
  await row(page, "MODIFIED FILES (3)", "sub")
    .getByRole("button", { name: "Discard Selected" })
    .click();
  await button(page, "Confirm discard?").click();

  await expect(group(page, "MODIFIED FILES (2)")).toHaveText(["a.txt", "sub"]);
  expect(status(repository)).toBe(" M a.txt\n M sub\n");

  await page.getByRole("heading", { name: "MODIFIED FILES (2)" }).hover();
  await button(page, "Stage All").click();

  await expect(group(page, "STAGED FILES (2)")).toHaveText(["a.txt", "sub"]);
  expect(status(repository)).toBe("M  a.txt\nM  sub\n");

  await page.getByRole("heading", { name: "STAGED FILES (2)" }).hover();
  await button(page, "Unstage All").click();

  await expect(group(page, "MODIFIED FILES (2)")).toHaveText(["a.txt", "sub"]);
  expect(status(repository)).toBe(" M a.txt\n M sub\n");

  await page.getByRole("heading", { name: "MODIFIED FILES (2)" }).hover();
  await button(page, "Discard All").click();
  await button(page, "Confirm discard?").click();

  await expect(group(page, "MODIFIED FILES (1)")).toHaveText(["sub"]);
  expect(status(repository)).toBe(" M sub\n");
  expect(runGit(sub, ["rev-parse", "HEAD"])).toBe(head);
  expect(readFileSync(join(sub, "s"), "utf8")).toBe("t\n");
});

test("a submodule whose files alone changed has no buttons, and the keys that run a file's actions do nothing there", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");

  const sub = addSubmodule(repository);

  writeFile(sub, "s", "t\n");
  writeFile(repository, "a.txt", "changed\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "sub");

  await expect(page.getByText("Submodule's files changed", { exact: true })).toBeVisible();
  await expect(fileBar(page, "MODIFIED sub").getByRole("button")).toHaveCount(0);
  await expect(row(page, "MODIFIED FILES (2)", "sub").getByRole("button")).toHaveCount(1);

  await pressFileKeys(page, "MODIFIED sub", "MODIFIED FILES (2)");

  await expect(button(page, "Confirm discard?")).toHaveCount(0);

  // Actions run one at a time, so once staging a.txt is done, any the keys ran would be too.
  await row(page, "MODIFIED FILES (2)", "a.txt").hover();
  await button(page, "Stage a.txt").click();

  await expect(group(page, "STAGED FILES (1)")).toHaveText(["a.txt"]);
  expect(status(repository)).toBe("M  a.txt\n M sub\n");
  expect(readFileSync(join(sub, "s"), "utf8")).toBe("t\n");
});

test('a repository inside the worktree that isn\'t a submodule is listed in UNTRACKED by its directory, showing "Git repository", left as it is, and its menu has the places a rule ignoring it can go', async ({
  app,
  page,
  repository,
}) => {
  nestRepository(repository, "vendor");
  writeFile(repository, "b.txt", "b\n");

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (2)", "vendor/");

  await expect(page.getByText("Git repository", { exact: true })).toBeVisible();
  await expect(fileBar(page, "UNTRACKED vendor/").getByRole("button")).toHaveCount(0);
  await expect(row(page, "UNTRACKED FILES (2)", "vendor/").getByRole("button")).toHaveCount(1);

  await page.getByRole("heading", { name: "UNTRACKED FILES (2)" }).hover();
  await button(page, "Delete All").click();
  await button(page, "Confirm delete?").click();

  await expect(group(page, "UNTRACKED FILES (1)")).toHaveText(["vendor/"]);
  expect(status(repository)).toBe("?? vendor/\n");

  await row(page, "UNTRACKED FILES (1)", "vendor/").click({ button: "right" });
  await page
    .getByRole("menu", { name: "vendor/" })
    .getByRole("menuitem", { name: "Ignore in .gitignore" })
    .click();
  await page.keyboard.press("Enter");

  await expect(group(page, "STAGED FILES (1)")).toHaveText([".gitignore"]);
  expect(readFileSync(join(repository, ".gitignore"), "utf8")).toBe("/vendor/\n");
  expect(status(repository)).toBe("A  .gitignore\n");
});
