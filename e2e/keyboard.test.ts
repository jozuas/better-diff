import { commitAll, runGit, worktreeFile, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { box, button, group, line, openFile } from "./panel";

function status(repository: string): string {
  return runGit(repository, ["status", "--porcelain", "--untracked-files=all"]);
}

function staged(repository: string): string {
  return runGit(repository, ["diff", "--cached"]);
}

function numbered(name: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${name} ${index + 1}`);
}

// Commits `a.txt` as lines 1 to 9, then changes its first and last line, which makes two hunks.
function changeTwoHunks(repository: string): void {
  writeFile(repository, "a.txt", "1\n2\n3\n4\n5\n6\n7\n8\n9\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "first\n2\n3\n4\n5\n6\n7\n8\nlast\n");
}

// Commits `a.txt` as 100 lines, then adds 40 after line 10 and 40 after line 60, which makes two
// hunks taller than the view. The second's lines start at line 58.
function changeTwoTallHunks(repository: string): void {
  const lines = numbered("line", 100);

  writeFile(repository, "a.txt", `${lines.join("\n")}\n`);
  commitAll(repository);
  writeFile(
    repository,
    "a.txt",
    `${[
      ...lines.slice(0, 10),
      ...numbered("first", 40),
      ...lines.slice(10, 60),
      ...numbered("second", 40),
      ...lines.slice(60),
    ].join("\n")}\n`,
  );
}

// Writes the file as lines from "<name> 1" to "<name> 60", which makes a diff taller than the view.
function writeLong(repository: string, path: string, name: string): void {
  writeFile(repository, path, `${numbered(name, 60).join("\n")}\n`);
}

test("↓ and ↑, with focus in a file's row, open the next file the sidebar lists or the one before, from the last file of one group to the first of the next, and focus moves along with them", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");
  writeFile(repository, "b.txt", "b\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "changed a\n");
  writeFile(repository, "b.txt", "changed b\n");
  writeFile(repository, "c.txt", "c\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "b.txt");
  await page.keyboard.press("ArrowDown");

  await expect(page.getByRole("heading", { name: "UNTRACKED c.txt" })).toBeVisible();
  await expect(button(page, "c.txt")).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");

  await expect(page.getByRole("heading", { name: "MODIFIED a.txt" })).toBeVisible();
  await expect(button(page, "a.txt")).toBeFocused();
  expect(status(repository)).toBe(" M a.txt\n M b.txt\n?? c.txt\n");
});

test("→ moves focus from a file's row into its diff, to its first hunk, and ← from a hunk's bar back to its file's row", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await expect(line(page, "first")).toBeVisible();
  await page.keyboard.press("ArrowRight");

  await expect(button(page, "Stage Hunk").first()).toBeFocused();
  await expect(button(page, "Stage Hunk").first()).toHaveCSS("opacity", "1");

  await page.keyboard.press("ArrowLeft");

  await expect(button(page, "a.txt")).toBeFocused();
  expect(status(repository)).toBe(" M a.txt\n");
});

test("with focus in a hunk's bar, ↓ and ↑ move focus to the next hunk or the one before, and the view shows that hunk from its start, where Enter stages it", async ({
  app,
  page,
  repository,
}) => {
  changeTwoTallHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  const stageHunk = button(page, "Stage Hunk");

  await stageHunk.first().focus();
  await page.keyboard.press("ArrowDown");

  await expect(stageHunk.nth(1)).toBeFocused();
  await expect(line(page, "line 58")).toBeInViewport();

  const bar = await box(stageHunk.nth(1));
  const start = await box(line(page, "line 58"));

  expect(start.y).toBeGreaterThan(bar.y + bar.height);
  expect(start.y).toBeLessThan(bar.y + bar.height + 10);

  await page.keyboard.press("ArrowUp");

  await expect(stageHunk.first()).toBeFocused();
  await expect(line(page, "line 8")).toBeInViewport();

  await page.keyboard.press("Enter");

  await expect(line(page, "first 1")).toBeHidden();
  expect(staged(repository)).toContain("+first 40\n");
  expect(staged(repository)).not.toContain("+second");
});

test("once an action on a hunk runs with focus in its bar, focus moves on to the hunk the view moves to, or else the last, or the next file's first once the file has none left, so Enter stages one hunk after another", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "b.txt", "b\n");
  changeTwoHunks(repository);
  writeFile(repository, "b.txt", "next\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");
  await button(page, "Stage Hunk").last().focus();
  await page.keyboard.press("Enter");
  await expect(line(page, "last")).toBeHidden();

  await expect(button(page, "Stage Hunk")).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "MODIFIED b.txt" })).toBeVisible();
  await expect(button(page, "Stage Hunk")).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(button(page, "Stage Hunk")).toBeHidden();
  expect(status(repository)).toBe("M  a.txt\nM  b.txt\n");
});

test("in a group's view, ↓ moves focus from one file's hunk to the next file's, and ← to the row of the file whose hunk has focus once Enter has staged that one", async ({
  app,
  page,
  repository,
}) => {
  writeLong(repository, "a.txt", "a");
  writeLong(repository, "b.txt", "b");

  await app.openPanel();
  await button(page, "UNTRACKED FILES (2)").click();
  await button(page, "Stage Hunk").first().focus();
  await page.keyboard.press("ArrowDown");

  await expect(button(page, "Stage Hunk").nth(1)).toBeFocused();
  await expect(line(page, "b 1")).toBeInViewport();
  await expect(line(page, "a 60")).not.toBeInViewport();

  await page.keyboard.press("Enter");

  await expect(line(page, "b 1")).toBeHidden();
  await expect(button(page, "Stage Hunk")).toBeFocused();

  await page.keyboard.press("ArrowLeft");

  await expect(button(page, "a.txt")).toBeFocused();
  expect(status(repository)).toBe("A  b.txt\n?? a.txt\n");
});

test("with focus in a hunk's bar, Backspace discards the hunk once pressed again to confirm, and held down asks only once", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await button(page, "Stage Hunk").first().focus();
  await page.keyboard.down("Backspace");
  await page.keyboard.down("Backspace");
  await page.keyboard.up("Backspace");

  await expect(button(page, "Confirm discard?")).toBeEnabled();
  expect(worktreeFile(repository, "a.txt")?.toString()).toBe("first\n2\n3\n4\n5\n6\n7\n8\nlast\n");

  await page.keyboard.press("Backspace");

  await expect(line(page, "first")).toBeHidden();
  await expect(button(page, "Stage Hunk")).toBeFocused();
  expect(worktreeFile(repository, "a.txt")?.toString()).toBe("1\n2\n3\n4\n5\n6\n7\n8\nlast\n");
});

test("with focus in a staged file's hunk's bar, Backspace unstages the hunk, Shift+Backspace the file, and Shift+Enter nothing", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);
  writeFile(repository, "b.txt", "b\n");
  runGit(repository, ["add", "a.txt", "b.txt"]);

  await app.openPanel();
  await openFile(page, "STAGED FILES (2)", "a.txt");
  await button(page, "Unstage Hunk").first().focus();
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Backspace");

  await expect(line(page, "last")).toBeHidden();
  await expect(button(page, "Unstage Hunk")).toBeFocused();
  expect(staged(repository)).toContain("+first");
  expect(staged(repository)).not.toContain("+last");

  await page.keyboard.press("Shift+Backspace");

  await expect(page.getByRole("heading", { name: "STAGED b.txt" })).toBeVisible();
  await expect(button(page, "Unstage Hunk")).toBeFocused();
  expect(status(repository)).toBe(" M a.txt\nA  b.txt\n");
});

test("with focus in a hunk's bar, Shift+Enter stages its file and Shift+Backspace discards it once pressed again to confirm, and focus moves on to the next file's first hunk", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "b.txt", "b\n");
  writeFile(repository, "c.txt", "c\n");
  changeTwoHunks(repository);
  writeFile(repository, "b.txt", "changed b\n");
  writeFile(repository, "c.txt", "changed c\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (3)", "a.txt");
  await button(page, "Stage Hunk").last().focus();
  await page.keyboard.press("Shift+Enter");

  await expect(page.getByRole("heading", { name: "MODIFIED b.txt" })).toBeVisible();
  await expect(button(page, "Stage Hunk")).toBeFocused();
  expect(status(repository)).toBe("M  a.txt\n M b.txt\n M c.txt\n");

  await page.keyboard.press("Shift+Backspace");

  await expect(button(page, "Confirm discard?")).toBeVisible();
  expect(status(repository)).toBe("M  a.txt\n M b.txt\n M c.txt\n");

  await page.keyboard.press("Shift+Backspace");

  await expect(page.getByRole("heading", { name: "MODIFIED c.txt" })).toBeVisible();
  await expect(button(page, "Stage Hunk")).toBeFocused();
  expect(status(repository)).toBe("M  a.txt\n M c.txt\n");
});

test("in a group's view, Shift+Enter in a hunk's bar stages its file, and focus moves on to the next file's first hunk", async ({
  app,
  page,
  repository,
}) => {
  writeLong(repository, "a.txt", "a");
  writeLong(repository, "b.txt", "b");

  await app.openPanel();
  await button(page, "UNTRACKED FILES (2)").click();
  await button(page, "Stage Hunk").first().focus();
  await page.keyboard.press("Shift+Enter");

  await expect(line(page, "a 1")).toBeHidden();
  await expect(button(page, "Stage Hunk")).toBeFocused();
  await expect(line(page, "b 1")).toBeInViewport();
  expect(status(repository)).toBe("A  a.txt\n?? b.txt\n");
});

test("with focus in a file's bar, Shift+Backspace discards the file once pressed again to confirm, and Shift+Enter stages it", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");
  writeFile(repository, "b.txt", "b\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "changed a\n");
  writeFile(repository, "b.txt", "changed b\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");
  await button(page, "Stage").focus();
  await page.keyboard.press("Shift+Backspace");

  await expect(button(page, "Confirm discard?")).toBeVisible();

  await page.keyboard.press("Shift+Backspace");

  await expect(page.getByRole("heading", { name: "MODIFIED b.txt" })).toBeVisible();
  expect(status(repository)).toBe(" M b.txt\n");

  await button(page, "Stage").focus();
  await page.keyboard.press("Shift+Enter");

  await expect(group(page, "STAGED FILES (1)")).toHaveText(["b.txt"]);
  expect(status(repository)).toBe("M  b.txt\n");
});
