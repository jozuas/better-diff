import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Page } from "@playwright/test";

import { commitAll, runGit, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { button, group, row } from "./panel";

function status(repository: string): string {
  return runGit(repository, ["status", "--porcelain", "--untracked-files=all"]);
}

// Right-clicks the untracked file's row, and picks the place from its menu.
async function ignoreIn(page: Page, heading: string, path: string, place: string): Promise<void> {
  await row(page, heading, path).click({ button: "right" });
  await page.getByRole("menu", { name: path }).getByRole("menuitem", { name: place }).click();
}

function field(page: Page) {
  return page.getByRole("textbox", { name: "File or pattern to ignore" });
}

test("an untracked file's menu has the places a rule ignoring it can go", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "m.txt", "m\n");
  commitAll(repository);
  writeFile(repository, "m.txt", "changed\n");
  writeFile(repository, "src/out/app.log", "");
  writeFile(repository, "top.log", "");

  await app.openPanel();
  await row(page, "UNTRACKED FILES (2)", "src/out/app.log").click({ button: "right" });

  const menu = page.getByRole("menu", { name: "src/out/app.log" });

  await expect(menu.getByRole("menuitem")).toHaveText([
    "Copy full path",
    "Copy relative path",
    "Copy filename",
    "Copy file contents",
    "Ignore in .gitignore",
    "Ignore in a subdirectory's .gitignore",
    "Ignore privately (.git/info/exclude)",
    "Ignore in all repositories (core.excludesFile isn't set)",
  ]);
  await expect(menu.getByRole("menuitem", { name: "Ignore in all repositories" })).toBeDisabled();
  await page.keyboard.press("Escape");

  await row(page, "UNTRACKED FILES (2)", "top.log").click({ button: "right" });
  await expect(
    page.getByRole("menu", { name: "top.log" }).getByRole("menuitem", { name: /^Ignore/u }),
  ).toHaveText([
    "Ignore in .gitignore",
    "Ignore privately (.git/info/exclude)",
    "Ignore in all repositories (core.excludesFile isn't set)",
  ]);
  await page.keyboard.press("Escape");

  await row(page, "MODIFIED FILES (1)", "m.txt").click({ button: "right" });
  await expect(
    page.getByRole("menu", { name: "m.txt" }).getByRole("menuitem", { name: /^Ignore/u }),
  ).toHaveCount(0);
});

test("ignoring a file in .gitignore adds the default with Enter, the file itself, and stages the .gitignore", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.log", "");
  writeFile(repository, "b.log", "");

  await app.openPanel();
  await ignoreIn(page, "UNTRACKED FILES (2)", "a.log", "Ignore in .gitignore");

  const prompt = page.getByRole("dialog", { name: "Ignore a.log" });

  await expect(prompt.getByRole("button")).toHaveText([
    "*.log",
    "/a.log",
    "/b.log",
    "Cancel",
    "Ignore",
  ]);
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveAttribute("placeholder", "/a.log");
  await page.keyboard.press("Enter");

  await expect(group(page, "UNTRACKED FILES (1)")).toHaveText(["b.log"]);
  await expect(group(page, "STAGED FILES (1)")).toHaveText([".gitignore"]);
  expect(readFileSync(join(repository, ".gitignore"), "utf8")).toBe("/a.log\n");
  expect(status(repository)).toBe("A  .gitignore\n?? b.log\n");
});

test("ignoring a file in a subdirectory's .gitignore asks which directory first, and adds a candidate picked from it", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "src/out/app.log", "");
  writeFile(repository, "src/out/b.log", "");

  await app.openPanel();
  await ignoreIn(
    page,
    "UNTRACKED FILES (2)",
    "src/out/app.log",
    "Ignore in a subdirectory's .gitignore",
  );

  const prompt = page.getByRole("dialog", { name: "Ignore src/out/app.log" });

  await expect(prompt.getByText("Limit rule to files in")).toBeVisible();
  await expect(prompt.getByRole("button")).toHaveText(["src/out/", "src/"]);
  await button(page, "src/").click();
  await expect(prompt.getByText("In src/.gitignore")).toBeVisible();
  await expect(field(page)).toHaveAttribute("placeholder", "/out/app.log");
  await button(page, "/out/*.log").click();

  await expect(page.getByRole("heading", { name: "UNTRACKED FILES (0)" })).toBeVisible();
  expect(readFileSync(join(repository, "src/.gitignore"), "utf8")).toBe("/out/*.log\n");
  expect(status(repository)).toBe("A  src/.gitignore\n");
});

test("typing shows only the candidates with what's typed, and Enter adds what's typed as it is", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.log", "");
  writeFile(repository, "b.txt", "");
  writeFile(repository, "c.txt", "");

  await app.openPanel();
  await ignoreIn(page, "UNTRACKED FILES (3)", "a.log", "Ignore privately (.git/info/exclude)");

  const prompt = page.getByRole("dialog", { name: "Ignore a.log" });

  await expect(prompt.getByText("In .git/info/exclude")).toBeVisible();
  await field(page).fill("txt");
  await expect(prompt.getByRole("button")).toHaveText([
    "*.txt",
    "/b.txt",
    "/c.txt",
    "Cancel",
    "Ignore",
  ]);
  await field(page).fill("b.*");
  await page.keyboard.press("Enter");

  await expect(group(page, "UNTRACKED FILES (2)")).toHaveText(["a.log", "c.txt"]);
  expect(readFileSync(join(repository, ".git/info/exclude"), "utf8")).toBe("b.*\n");
  expect(status(repository)).toBe("?? a.log\n?? c.txt\n");
});

test("ignoring a file in all repositories adds the rule to the file core.excludesFile names", async ({
  app,
  page,
  repository,
}) => {
  const excludes = join(repository, ".git", "global-excludes");

  runGit(repository, ["config", "core.excludesFile", excludes]);
  writeFile(repository, "a.log", "");
  writeFile(repository, "b.log", "");

  await app.openPanel();
  await ignoreIn(page, "UNTRACKED FILES (2)", "a.log", `Ignore in all repositories (${excludes})`);
  await expect(page.getByText(`In ${excludes}`)).toBeVisible();
  await button(page, "*.log").click();

  await expect(page.getByRole("heading", { name: "UNTRACKED FILES (0)" })).toBeVisible();
  expect(readFileSync(excludes, "utf8")).toBe("*.log\n");
  expect(status(repository)).toBe("");
});

test("Escape, Cancel, or a click outside it, closes the prompt for a rule without adding one", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.log", "");

  await app.openPanel();

  const prompt = page.getByRole("dialog", { name: "Ignore a.log" });

  await ignoreIn(page, "UNTRACKED FILES (1)", "a.log", "Ignore in .gitignore");
  await expect(field(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(prompt).toBeHidden();

  await ignoreIn(page, "UNTRACKED FILES (1)", "a.log", "Ignore in .gitignore");
  await button(page, "Cancel").click();
  await expect(prompt).toBeHidden();

  await ignoreIn(page, "UNTRACKED FILES (1)", "a.log", "Ignore in .gitignore");
  await page.mouse.click(5, 5);
  await expect(prompt).toBeHidden();

  expect(existsSync(join(repository, ".gitignore"))).toBe(false);
  expect(status(repository)).toBe("?? a.log\n");
});
