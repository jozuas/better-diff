import type { Page } from "@playwright/test";
import { z } from "zod";

import { commitAll, runGit, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { box, button, line, selectLines } from "./panel";

function status(repository: string): string {
  return runGit(repository, ["status", "--porcelain", "--untracked-files=all"]);
}

function staged(repository: string): string {
  return runGit(repository, ["diff", "--cached"]);
}

// Writes the file as lines from "<name> 1" to "<name> 60", which makes a diff taller than the view.
function writeLong(repository: string, path: string, name: string): void {
  writeFile(
    repository,
    path,
    Array.from({ length: 60 }, (_, index) => `${name} ${index + 1}\n`).join(""),
  );
}

// The heading of the file bar shown in the middle of where the box is, over any stuck under it.
async function barAt(
  page: Page,
  { x, y, width, height }: { x: number; y: number; width: number; height: number },
): Promise<string> {
  const text = await page.evaluate(
    `document.elementFromPoint(${x + width / 2}, ${y + height / 2})?.closest('[role="heading"]')?.textContent ?? ""`,
  );

  return z.string().parse(text);
}

test("clicking a group shows the diffs of all its files in one scrollable view, instead of file by file", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");
  writeFile(repository, "b.txt", "b\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "changed a\n");
  writeFile(repository, "b.txt", "changed b\n");
  writeFile(repository, "c.txt", "new c\n");

  await app.openPanel();
  await button(page, "MODIFIED FILES (2)").click();

  await expect(page.getByRole("heading", { name: "MODIFIED a.txt" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "MODIFIED b.txt" })).toBeVisible();
  await expect(line(page, "changed a")).toBeVisible();
  await expect(line(page, "changed b")).toBeVisible();
  await expect(line(page, "new c")).toHaveCount(0);

  await page
    .getByRole("heading", { name: "MODIFIED b.txt" })
    .getByRole("button", { name: "Stage", exact: true })
    .click();

  await expect(page.getByRole("heading", { name: "MODIFIED b.txt" })).toHaveCount(0);
  await expect(line(page, "changed a")).toBeVisible();
  expect(status(repository)).toBe(" M a.txt\nM  b.txt\n?? c.txt\n");
});

test("each file's bar is a sticky header, so you always know which file you're looking at", async ({
  app,
  page,
  repository,
}) => {
  writeLong(repository, "a.txt", "a");
  writeLong(repository, "b.txt", "b");

  await app.openPanel();
  await button(page, "UNTRACKED FILES (2)").click();

  const top = await box(page.getByRole("heading", { name: "UNTRACKED a.txt" }));

  await line(page, "a 40").scrollIntoViewIfNeeded();
  await expect(line(page, "a 1")).not.toBeInViewport();

  expect(await barAt(page, top)).toMatch(/^UNTRACKEDa\.txt/u);

  await line(page, "b 40").scrollIntoViewIfNeeded();
  await expect(line(page, "b 1")).not.toBeInViewport();

  expect(await barAt(page, top)).toMatch(/^UNTRACKEDb\.txt/u);
  expect(status(repository)).toBe("?? a.txt\n?? b.txt\n");
});

test("staging a file from its bar in a group's view moves the view to the start of the next file", async ({
  app,
  page,
  repository,
}) => {
  writeLong(repository, "a.txt", "a");
  writeLong(repository, "b.txt", "b");
  writeLong(repository, "c.txt", "c");

  await app.openPanel();
  await button(page, "UNTRACKED FILES (3)").click();

  const top = await box(page.getByRole("heading", { name: "UNTRACKED a.txt" }));

  await line(page, "b 40").scrollIntoViewIfNeeded();
  await expect(line(page, "b 1")).not.toBeInViewport();

  await page
    .getByRole("heading", { name: "UNTRACKED b.txt" })
    .getByRole("button", { name: "Stage", exact: true })
    .click();

  await expect(page.getByRole("heading", { name: "UNTRACKED b.txt" })).toHaveCount(0);
  await expect(line(page, "c 1")).toBeInViewport();

  expect(await barAt(page, top)).toMatch(/^UNTRACKEDc\.txt/u);
  expect(runGit(repository, ["diff", "--cached", "--name-only"])).toBe("b.txt\n");
});

test("a selection in a group's view stays within the hunk of the file it starts in", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a line\n");
  writeFile(repository, "b.txt", "b line\n");

  await app.openPanel();
  await button(page, "UNTRACKED FILES (2)").click();
  await selectLines(page, "a line", "b line");

  await expect(button(page, "Stage Lines")).toHaveCount(1);

  await button(page, "Stage Lines").click();

  await expect(page.getByRole("heading", { name: "STAGED FILES (1)" })).toBeVisible();
  expect(staged(repository)).toContain("+a line");
  expect(staged(repository)).not.toContain("+b line");
});

test("a group's view shows the diffs of only the files the filter lists", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "src/a.txt", "a line\n");
  writeFile(repository, "docs/b.txt", "b line\n");

  await app.openPanel();
  await page.getByRole("textbox", { name: "Filter files" }).fill("src");
  await button(page, "UNTRACKED FILES (1 of 2)").click();

  await expect(line(page, "a line")).toBeVisible();
  await expect(line(page, "b line")).toHaveCount(0);
  expect(status(repository)).toBe("?? docs/b.txt\n?? src/a.txt\n");
});

test('a generated file in a group\'s view is collapsed to "Generated file" until "Show diff" shows its diff', async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");
  writeFile(repository, "yarn.lock", "{}\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "changed a\n");
  writeFile(repository, "yarn.lock", "{ locked }\n");

  await app.openPanel();
  await button(page, "MODIFIED FILES (2)").click();

  await expect(line(page, "changed a")).toBeVisible();
  await expect(page.getByText("Generated file", { exact: true })).toBeVisible();
  await expect(line(page, "{ locked }")).toHaveCount(0);

  await button(page, "Show diff").click();

  await expect(line(page, "{ locked }")).toBeVisible();
  await expect(line(page, "changed a")).toBeVisible();
  expect(status(repository)).toBe(" M a.txt\n M yarn.lock\n");
});
