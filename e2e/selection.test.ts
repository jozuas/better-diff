import type { Locator, Page } from "@playwright/test";

import { commitAll, runGit, worktreeFile, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { button, group, line, openFile, row } from "./panel";

const paths = ["a.txt", "b.txt", "c.txt", "d.txt", "e.txt"];

// Commits the files from `a.txt` to `e.txt`, then changes each to "changed <path>".
function changeFive(repository: string): void {
  for (const path of paths) {
    writeFile(repository, path, `${path}\n`);
  }

  commitAll(repository);

  for (const path of paths) {
    writeFile(repository, path, `changed ${path}\n`);
  }
}

function status(repository: string): string {
  return runGit(repository, ["status", "--porcelain", "--untracked-files=all"]);
}

const allModified = " M a.txt\n M b.txt\n M c.txt\n M d.txt\n M e.txt\n";

// The changed files' added lines the diffs shown have, in their order.
function changedLines(page: Page): Locator {
  return page.getByText(/^changed .\.txt$/u);
}

async function shiftClick(page: Page, heading: string, path: string): Promise<void> {
  await row(page, heading, path)
    .getByRole("button", { name: path, exact: true })
    .click({ modifiers: ["Shift"] });
}

test("shift-clicking a file selects the files from the open one to it, and shift-clicking another selects from the same file again", async ({
  app,
  page,
  repository,
}) => {
  changeFive(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (5)", "b.txt");
  await shiftClick(page, "MODIFIED FILES (5)", "d.txt");

  await expect(changedLines(page)).toHaveText(["changed b.txt", "changed c.txt", "changed d.txt"]);

  await shiftClick(page, "MODIFIED FILES (5)", "a.txt");

  await expect(changedLines(page)).toHaveText(["changed a.txt", "changed b.txt"]);
  expect(status(repository)).toBe(allModified);
});

test("Shift+↓ and Shift+↑, with focus in a file's row, select one more file or one fewer, and focus moves along with them", async ({
  app,
  page,
  repository,
}) => {
  changeFive(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (5)", "b.txt");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(changedLines(page)).toHaveText(["changed b.txt", "changed c.txt"]);
  await expect(button(page, "c.txt")).toBeFocused();
  await page.keyboard.press("Shift+ArrowDown");
  await expect(changedLines(page)).toHaveText(["changed b.txt", "changed c.txt", "changed d.txt"]);
  await page.keyboard.press("Shift+ArrowUp");
  await page.keyboard.press("Shift+ArrowUp");
  await page.keyboard.press("Shift+ArrowUp");

  await expect(changedLines(page)).toHaveText(["changed a.txt", "changed b.txt"]);
  await expect(button(page, "a.txt")).toBeFocused();
  expect(status(repository)).toBe(allModified);
});

test("a selection stays within one group: shift-clicking a file in another group opens just that file", async ({
  app,
  page,
  repository,
}) => {
  changeFive(repository);
  writeFile(repository, "z.txt", "new z.txt\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (5)", "b.txt");
  await shiftClick(page, "UNTRACKED FILES (1)", "z.txt");

  await expect(line(page, "new z.txt")).toBeVisible();
  await expect(changedLines(page)).toHaveCount(0);
  expect(status(repository)).toBe(`${allModified}?? z.txt\n`);
});

test("the selected files' diffs show in one view, as a group's do, whatever the filter", async ({
  app,
  page,
  repository,
}) => {
  changeFive(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (5)", "b.txt");
  await shiftClick(page, "MODIFIED FILES (5)", "c.txt");
  await page.getByRole("textbox", { name: "Filter files" }).fill("b.txt");

  await expect(group(page, "MODIFIED FILES (1 of 5)")).toHaveText(["b.txt"]);
  await expect(page.getByRole("heading", { name: "MODIFIED b.txt" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "MODIFIED c.txt" })).toBeVisible();
  await expect(changedLines(page)).toHaveText(["changed b.txt", "changed c.txt"]);
  expect(status(repository)).toBe(allModified);
});

test("the selected files' rows show their actions always, and Stage Selected stages all of them, and Unstage Selected unstages them", async ({
  app,
  page,
  repository,
}) => {
  changeFive(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (5)", "b.txt");
  await shiftClick(page, "MODIFIED FILES (5)", "c.txt");
  await page.mouse.move(0, 0);

  const stage = row(page, "MODIFIED FILES (5)", "b.txt").getByRole("button", {
    name: "Stage Selected",
  });

  await expect(stage).toHaveCSS("opacity", "1");
  await expect(button(page, "Stage a.txt")).toHaveCSS("opacity", "0");
  await stage.click();
  await expect(group(page, "STAGED FILES (2)")).toHaveText(["b.txt", "c.txt"]);

  expect(status(repository)).toBe(" M a.txt\nM  b.txt\nM  c.txt\n M d.txt\n M e.txt\n");

  await openFile(page, "STAGED FILES (2)", "b.txt");
  await shiftClick(page, "STAGED FILES (2)", "c.txt");
  await row(page, "STAGED FILES (2)", "c.txt")
    .getByRole("button", { name: "Unstage Selected" })
    .click();

  await expect(page.getByRole("heading", { name: "STAGED FILES (0)" })).toBeVisible();
  expect(status(repository)).toBe(allModified);
});

test('Discard Selected asks "Confirm discard?" first, then discards all the selected files, and Delete Selected asks "Confirm delete?", then deletes them', async ({
  app,
  page,
  repository,
}) => {
  changeFive(repository);
  writeFile(repository, "x.txt", "new x\n");
  writeFile(repository, "y.txt", "new y\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (5)", "d.txt");
  await shiftClick(page, "MODIFIED FILES (5)", "e.txt");
  await row(page, "MODIFIED FILES (5)", "d.txt")
    .getByRole("button", { name: "Discard Selected" })
    .click();
  await expect(button(page, "Confirm discard?")).toBeVisible();

  expect(worktreeFile(repository, "d.txt")?.toString()).toBe("changed d.txt\n");

  await button(page, "Confirm discard?").click();
  await expect(group(page, "MODIFIED FILES (3)")).toHaveText(["a.txt", "b.txt", "c.txt"]);
  await openFile(page, "UNTRACKED FILES (2)", "x.txt");
  await shiftClick(page, "UNTRACKED FILES (2)", "y.txt");
  await row(page, "UNTRACKED FILES (2)", "y.txt")
    .getByRole("button", { name: "Delete Selected" })
    .click();
  await button(page, "Confirm delete?").click();

  await expect(page.getByRole("heading", { name: "UNTRACKED FILES (0)" })).toBeVisible();
  expect(status(repository)).toBe(" M a.txt\n M b.txt\n M c.txt\n");
});

test("an action on the selected files changes nothing, and says so, if one has left the group since they were selected", async ({
  app,
  page,
  repository,
}) => {
  changeFive(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (5)", "b.txt");
  await shiftClick(page, "MODIFIED FILES (5)", "c.txt");
  await expect(changedLines(page)).toHaveText(["changed b.txt", "changed c.txt"]);

  runGit(repository, ["add", "b.txt"]);
  await row(page, "MODIFIED FILES (5)", "c.txt")
    .getByRole("button", { name: "Stage Selected" })
    .click();

  await expect(
    page.getByText(/^The selected files changed after they were selected, so nothing was done\./u),
  ).toBeVisible();
  await expect(group(page, "STAGED FILES (1)")).toHaveText(["b.txt"]);
  expect(status(repository)).toBe(" M a.txt\nM  b.txt\n M c.txt\n M d.txt\n M e.txt\n");
});

test("once some of the selected files leave the group, as after staging one from its file bar, the rest stay selected", async ({
  app,
  page,
  repository,
}) => {
  changeFive(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (5)", "b.txt");
  await shiftClick(page, "MODIFIED FILES (5)", "d.txt");
  await page
    .getByRole("heading", { name: "MODIFIED c.txt" })
    .getByRole("button", { name: "Stage", exact: true })
    .click();

  await expect(group(page, "STAGED FILES (1)")).toHaveText(["c.txt"]);
  await expect(changedLines(page)).toHaveText(["changed b.txt", "changed d.txt"]);
  await expect(
    row(page, "MODIFIED FILES (4)", "d.txt").getByRole("button", {
      name: "Stage Selected",
    }),
  ).toBeVisible();
  expect(status(repository)).toBe(" M a.txt\n M b.txt\nM  c.txt\n M d.txt\n M e.txt\n");
});
