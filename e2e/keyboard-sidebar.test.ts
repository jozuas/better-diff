import { commitAll, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { fileBar, heading, hunkBar, status } from "./keyboard";
import { button, group, openFile } from "./panel";

// Commits `a.txt` and `b.txt`, changes both, and adds `c.txt`.
function changeTwoAddOne(repository: string): void {
  writeFile(repository, "a.txt", "a\n");
  writeFile(repository, "b.txt", "b\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "changed a\n");
  writeFile(repository, "b.txt", "changed b\n");
  writeFile(repository, "c.txt", "c\n");
}

test("↓ and ↑ move focus through the sidebar's headings and rows, from one group to the next, opening each file they reach and no group", async ({
  app,
  page,
  repository,
}) => {
  changeTwoAddOne(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "b.txt");
  await page.keyboard.press("ArrowDown");

  await expect(heading(page, "UNTRACKED FILES (1)")).toBeFocused();
  await expect(fileBar(page, "MODIFIED b.txt")).toBeVisible();

  await page.keyboard.press("ArrowDown");

  await expect(button(page, "c.txt")).toBeFocused();
  await expect(fileBar(page, "UNTRACKED c.txt")).toBeVisible();

  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");

  await expect(button(page, "a.txt")).toBeFocused();
  await expect(fileBar(page, "MODIFIED a.txt")).toBeVisible();
  expect(status(repository)).toBe(" M a.txt\n M b.txt\n?? c.txt\n");
});

test("Alt+↓ and Alt+↑ move focus from heading to heading, and ↑ on the first heading moves it to the filter", async ({
  app,
  page,
  repository,
}) => {
  changeTwoAddOne(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");
  await page.keyboard.press("Alt+ArrowDown");

  await expect(heading(page, "UNTRACKED FILES (1)")).toBeFocused();

  await page.keyboard.press("Alt+ArrowDown");
  await page.keyboard.press("Alt+ArrowUp");
  await page.keyboard.press("Alt+ArrowUp");

  await expect(heading(page, "MODIFIED FILES (2)")).toBeFocused();

  await page.keyboard.press("ArrowUp");

  await expect(page.getByRole("textbox", { name: "Filter files" })).toBeFocused();
});

test("Enter in a group's heading opens the group, and ← collapses the group and → expands it again", async ({
  app,
  page,
  repository,
}) => {
  changeTwoAddOne(repository);

  await app.openPanel();
  await heading(page, "MODIFIED FILES (2)").focus();
  await page.keyboard.press("Enter");

  await expect(fileBar(page, "MODIFIED a.txt")).toBeVisible();
  await expect(fileBar(page, "MODIFIED b.txt")).toBeVisible();

  await page.keyboard.press("ArrowLeft");

  await expect(group(page, "MODIFIED FILES (2)")).toHaveCount(0);
  await expect(button(page, "MODIFIED FILES")).toHaveAttribute("aria-expanded", "false");

  await page.keyboard.press("ArrowDown");

  await expect(heading(page, "UNTRACKED FILES (1)")).toBeFocused();

  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");

  await expect(group(page, "MODIFIED FILES (2)")).toHaveText(["a.txt", "b.txt"]);
});

test("`/` moves focus to the filter from anywhere in the panel, where ↓ and Enter move focus to the first file it lists, opening it, and Escape clears it, or once it's empty moves focus to the open file's row", async ({
  app,
  page,
  repository,
}) => {
  changeTwoAddOne(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "b.txt");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("/");

  const filter = page.getByRole("textbox", { name: "Filter files" });

  await expect(filter).toBeFocused();

  await page.keyboard.type("c.");
  await page.keyboard.press("Enter");

  await expect(button(page, "c.txt")).toBeFocused();
  await expect(fileBar(page, "UNTRACKED c.txt")).toBeVisible();

  await page.keyboard.press("/");
  await page.keyboard.press("Escape");

  await expect(filter).toHaveValue("");
  await expect(filter).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(button(page, "c.txt")).toBeFocused();

  await page.keyboard.press("/");
  await page.keyboard.press("ArrowDown");

  await expect(button(page, "a.txt")).toBeFocused();
  await expect(fileBar(page, "MODIFIED a.txt")).toBeVisible();
});

test("Shift+Enter and Shift+Backspace in a file's row act on the file as the row's buttons do, and focus moves to the row of the file the view moves on to, in a group below once its group has no file left", async ({
  app,
  page,
  repository,
}) => {
  changeTwoAddOne(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");
  await page.keyboard.press("Shift+Enter");

  await expect(group(page, "STAGED FILES (1)")).toHaveText(["a.txt"]);
  await expect(button(page, "b.txt")).toBeFocused();

  await page.keyboard.press("Shift+Backspace");

  await expect(button(page, "Confirm discard?")).toBeVisible();

  await page.keyboard.press("Shift+Backspace");

  await expect(heading(page, "MODIFIED FILES (0)")).toBeVisible();
  await expect(fileBar(page, "UNTRACKED c.txt")).toBeVisible();
  await expect(button(page, "c.txt")).toBeFocused();
  expect(status(repository)).toBe("M  a.txt\n?? c.txt\n");
});

test("once an action runs from a file's row and no file is left for the view to move on to, focus moves to the row or heading that takes its place", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "changed a\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await page.keyboard.press("Shift+Backspace");
  await expect(button(page, "Confirm discard?")).toBeVisible();
  await page.keyboard.press("Shift+Backspace");

  await expect(heading(page, "MODIFIED FILES (0)")).toBeVisible();
  await expect(heading(page, "UNTRACKED FILES (0)")).toBeFocused();
  expect(status(repository)).toBe("");
});

test("Shift+Enter in a selected file's row stages the selected files, and Escape there opens just that file", async ({
  app,
  page,
  repository,
}) => {
  changeTwoAddOne(repository);
  writeFile(repository, "d.txt", "d\n");

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (2)", "c.txt");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Escape");

  await expect(fileBar(page, "UNTRACKED d.txt")).toBeVisible();
  await expect(fileBar(page, "UNTRACKED c.txt")).toBeHidden();

  await page.keyboard.press("Shift+ArrowUp");
  await page.keyboard.press("Shift+Enter");

  await expect(group(page, "STAGED FILES (2)")).toHaveText(["c.txt", "d.txt"]);
  expect(status(repository)).toBe(" M a.txt\n M b.txt\nA  c.txt\nA  d.txt\n");
});

test("Shift+Enter in a group's heading stages all its files, and Shift+Backspace discards them once pressed again to confirm", async ({
  app,
  page,
  repository,
}) => {
  changeTwoAddOne(repository);

  await app.openPanel();
  await heading(page, "UNTRACKED FILES (1)").focus();
  await page.keyboard.press("Shift+Enter");

  await expect(group(page, "STAGED FILES (1)")).toHaveText(["c.txt"]);
  await expect(button(page, "Discard All")).toBeEnabled();

  await heading(page, "MODIFIED FILES (2)").focus();
  await page.keyboard.press("Shift+Backspace");

  await expect(button(page, "Confirm discard?")).toBeVisible();

  await page.keyboard.press("Shift+Backspace");

  await expect(heading(page, "MODIFIED FILES (0)")).toBeVisible();
  expect(status(repository)).toBe("A  c.txt\n");
});

test("→ on an expanded group's heading opens the group, with focus on its first file's first hunk", async ({
  app,
  page,
  repository,
}) => {
  changeTwoAddOne(repository);

  await app.openPanel();
  await heading(page, "MODIFIED FILES (2)").focus();
  await page.keyboard.press("ArrowRight");

  await expect(fileBar(page, "MODIFIED b.txt")).toBeVisible();
  await expect(hunkBar(page, "a.txt")).toBeFocused();

  await page.keyboard.press("ArrowLeft");

  await expect(button(page, "a.txt")).toBeFocused();

  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");

  await expect(hunkBar(page, "a.txt")).toBeFocused();
  expect(status(repository)).toBe(" M a.txt\n M b.txt\n?? c.txt\n");
});

test("once an action runs from a file's row, focus moves to the row of the file the view moves on to", async ({
  app,
  page,
  repository,
}) => {
  changeTwoAddOne(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "b.txt");
  await page.keyboard.press("Shift+Enter");

  await expect(group(page, "STAGED FILES (1)")).toHaveText(["b.txt"]);
  await expect(fileBar(page, "MODIFIED a.txt")).toBeVisible();
  await expect(button(page, "a.txt")).toBeFocused();
  expect(status(repository)).toBe(" M a.txt\nM  b.txt\n?? c.txt\n");
});

test("holding ↓ or ↑ in the sidebar moves focus on without opening each file it passes: the file of the row focus stops at opens once the key is let go", async ({
  app,
  page,
  repository,
}) => {
  for (const name of ["a", "b", "c", "d"]) {
    writeFile(repository, `${name}.txt`, `${name}\n`);
  }

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (4)", "a.txt");
  await page.keyboard.down("ArrowDown");
  await page.keyboard.down("ArrowDown");
  await page.keyboard.down("ArrowDown");

  await expect(button(page, "d.txt")).toBeFocused();
  await expect(fileBar(page, "UNTRACKED b.txt")).toBeVisible();

  await page.keyboard.up("ArrowDown");

  await expect(fileBar(page, "UNTRACKED d.txt")).toBeVisible();
  await expect(button(page, "d.txt")).toBeFocused();

  await page.keyboard.down("ArrowUp");
  await page.keyboard.down("ArrowUp");

  await expect(button(page, "b.txt")).toBeFocused();
  await expect(fileBar(page, "UNTRACKED c.txt")).toBeVisible();

  await page.keyboard.up("ArrowUp");

  await expect(fileBar(page, "UNTRACKED b.txt")).toBeVisible();
  expect(status(repository)).toBe("?? a.txt\n?? b.txt\n?? c.txt\n?? d.txt\n");
});

test("→ on the row of a file the view doesn't show opens the file, with focus on its first hunk", async ({
  app,
  page,
  repository,
}) => {
  changeTwoAddOne(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");
  await expect(fileBar(page, "MODIFIED a.txt")).toBeVisible();
  await button(page, "c.txt").focus();
  await page.keyboard.press("ArrowRight");

  await expect(hunkBar(page, "c.txt")).toBeFocused();
  await expect(fileBar(page, "UNTRACKED c.txt")).toBeVisible();
  expect(status(repository)).toBe(" M a.txt\n M b.txt\n?? c.txt\n");
});
