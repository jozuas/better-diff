import {
  commitAll,
  makeExecutable,
  runGit,
  worktreeFile,
  worktreeMode,
  writeFile,
} from "../test/repository";
import { expect, test } from "./fixtures";
import { changeTwoHunks, fileBar, hunkBar, modeBar, staged, status, writeLong } from "./keyboard";
import { button, group, line, openFile } from "./panel";

test("Enter in a hunk's bar stages the hunk, and focus moves on to the hunk that takes its place, or else the last, or the next file's first once the file has none left, so Enter stages one hunk after another", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "b.txt", "b\n");
  changeTwoHunks(repository);
  writeFile(repository, "b.txt", "next\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");
  await hunkBar(page, "a.txt", 2).focus();
  await page.keyboard.press("Enter");
  await expect(line(page, "last")).toBeHidden();

  await expect(hunkBar(page, "a.txt")).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(fileBar(page, "MODIFIED b.txt")).toBeVisible();
  await expect(hunkBar(page, "b.txt")).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(hunkBar(page, "b.txt")).toBeHidden();
  expect(status(repository)).toBe("M  a.txt\nM  b.txt\n");
});

test("once the open file's group has no file left, Enter moves focus on to the first hunk of the first file of a group below, so Enter stages one file after another from MODIFIED to UNTRACKED and then to STAGED", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "changed a\n");
  writeFile(repository, "b.txt", "b\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await hunkBar(page, "a.txt").focus();
  await page.keyboard.press("Enter");

  await expect(fileBar(page, "UNTRACKED b.txt")).toBeVisible();
  await expect(hunkBar(page, "b.txt")).toBeFocused();
  expect(status(repository)).toBe("M  a.txt\n?? b.txt\n");

  await page.keyboard.press("Enter");

  await expect(fileBar(page, "STAGED a.txt")).toBeVisible();
  await expect(hunkBar(page, "a.txt")).toBeFocused();
  expect(status(repository)).toBe("M  a.txt\nA  b.txt\n");
});

test("Backspace in a hunk's bar discards the hunk once pressed again to confirm, held down asks only once, and Escape takes the question back", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await hunkBar(page, "a.txt").focus();
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Escape");

  await expect(button(page, "Confirm discard?")).toBeHidden();

  await page.keyboard.down("Backspace");
  await page.keyboard.down("Backspace");
  await page.keyboard.up("Backspace");

  await expect(button(page, "Confirm discard?")).toBeEnabled();
  expect(worktreeFile(repository, "a.txt")?.toString()).toBe("first\n2\n3\n4\n5\n6\n7\n8\nlast\n");

  await page.keyboard.press("Backspace");

  await expect(line(page, "first")).toBeHidden();
  await expect(hunkBar(page, "a.txt")).toBeFocused();
  expect(worktreeFile(repository, "a.txt")?.toString()).toBe("1\n2\n3\n4\n5\n6\n7\n8\nlast\n");
});

test("in STAGED, Enter and Backspace in a hunk's bar unstage the hunk, and Shift+Enter and Shift+Backspace unstage its file", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "b.txt", "b\n");
  writeFile(repository, "c.txt", "c\n");
  changeTwoHunks(repository);
  writeFile(repository, "b.txt", "changed b\n");
  writeFile(repository, "c.txt", "changed c\n");
  runGit(repository, ["add", "a.txt", "b.txt", "c.txt"]);

  await app.openPanel();
  await openFile(page, "STAGED FILES (3)", "a.txt");
  await hunkBar(page, "a.txt").focus();
  await page.keyboard.press("Enter");

  await expect(line(page, "first")).toBeHidden();
  await expect(hunkBar(page, "a.txt")).toBeFocused();

  await page.keyboard.press("Backspace");

  await expect(fileBar(page, "STAGED b.txt")).toBeVisible();
  await expect(hunkBar(page, "b.txt")).toBeFocused();

  await page.keyboard.press("Shift+Enter");

  await expect(fileBar(page, "STAGED c.txt")).toBeVisible();
  await expect(hunkBar(page, "c.txt")).toBeFocused();

  await page.keyboard.press("Shift+Backspace");

  await expect(hunkBar(page, "c.txt")).toBeHidden();
  expect(status(repository)).toBe(" M a.txt\n M b.txt\n M c.txt\n");
});

test("Shift+Enter in a hunk's bar stages its file and Shift+Backspace discards it once pressed again to confirm, and focus moves on to the next file's first hunk", async ({
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
  await hunkBar(page, "a.txt", 2).focus();
  await page.keyboard.press("Shift+Enter");

  await expect(fileBar(page, "MODIFIED b.txt")).toBeVisible();
  await expect(hunkBar(page, "b.txt")).toBeFocused();
  expect(status(repository)).toBe("M  a.txt\n M b.txt\n M c.txt\n");

  await page.keyboard.press("Shift+Backspace");

  await expect(button(page, "Confirm discard?")).toBeVisible();
  expect(status(repository)).toBe("M  a.txt\n M b.txt\n M c.txt\n");

  await page.keyboard.press("Shift+Backspace");

  await expect(fileBar(page, "MODIFIED c.txt")).toBeVisible();
  await expect(hunkBar(page, "c.txt")).toBeFocused();
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
  await hunkBar(page, "a.txt").focus();
  await page.keyboard.press("Shift+Enter");

  await expect(line(page, "a 1")).toBeHidden();
  await expect(hunkBar(page, "b.txt")).toBeFocused();
  await expect(line(page, "b 1")).toBeInViewport();
  expect(status(repository)).toBe("A  a.txt\n?? b.txt\n");
});

test("Enter in a file's bar stages the file, and Shift+Backspace discards it once pressed again to confirm", async ({
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
  await expect(line(page, "changed a")).toBeVisible();
  await fileBar(page, "MODIFIED a.txt").focus();
  await page.keyboard.press("Shift+Backspace");

  await expect(button(page, "Confirm discard?")).toBeVisible();

  await page.keyboard.press("Shift+Backspace");

  await expect(fileBar(page, "MODIFIED b.txt")).toBeVisible();
  await expect(hunkBar(page, "b.txt")).toBeFocused();
  expect(status(repository)).toBe(" M b.txt\n");

  await fileBar(page, "MODIFIED b.txt").focus();
  await page.keyboard.press("Enter");

  await expect(group(page, "STAGED FILES (1)")).toHaveText(["b.txt"]);
  expect(status(repository)).toBe("M  b.txt\n");
});

test("Enter in a mode change's bar stages the mode change, and focus moves on to the file's first hunk, and Backspace discards one once pressed again to confirm", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "run.sh", "echo a\n");
  writeFile(repository, "other.sh", "echo a\n");
  commitAll(repository);
  writeFile(repository, "run.sh", "echo b\n");
  makeExecutable(repository, "run.sh");
  makeExecutable(repository, "other.sh");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "run.sh");
  await modeBar(page, "run.sh").focus();
  await page.keyboard.press("Enter");

  await expect(modeBar(page, "run.sh")).toBeHidden();
  await expect(hunkBar(page, "run.sh")).toBeFocused();
  expect(staged(repository)).toBe(
    "diff --git a/run.sh b/run.sh\nold mode 100644\nnew mode 100755\n",
  );

  await openFile(page, "MODIFIED FILES (2)", "other.sh");
  await modeBar(page, "other.sh").focus();
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");

  await expect(modeBar(page, "other.sh")).toBeHidden();
  expect(worktreeMode(repository, "other.sh")).toBe("100644");
});

test("one action runs at a time: while one runs, the buttons that run actions are disabled, and a key that runs one does nothing", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  const release = await app.holdAction();

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await button(page, "Stage Hunk").first().click();

  await expect(button(page, "Stage")).toBeDisabled();
  await expect(button(page, "Stage Hunk").nth(1)).toBeDisabled();

  await hunkBar(page, "a.txt", 2).focus();
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Shift+Enter");
  release();

  await expect(line(page, "first")).toBeHidden();
  expect(staged(repository)).toContain("+first\n");
  expect(staged(repository)).not.toContain("+last");
  expect(worktreeFile(repository, "a.txt")?.toString()).toBe("first\n2\n3\n4\n5\n6\n7\n8\nlast\n");
});

test("in a group's view, Shift+Enter in a mode change's bar stages its file, and the view moves on to the next file, from its start", async ({
  app,
  page,
  repository,
}) => {
  writeLong(repository, "a.txt", "a");
  writeLong(repository, "b.txt", "b");
  commitAll(repository);
  writeLong(repository, "a.txt", "changed a");
  writeLong(repository, "b.txt", "changed b");
  makeExecutable(repository, "a.txt");

  await app.openPanel();
  await button(page, "MODIFIED FILES (2)").click();
  await modeBar(page, "a.txt").focus();
  await line(page, "a 5").hover();
  await page.mouse.wheel(0, 400);

  await expect(line(page, "a 1")).not.toBeInViewport();

  await page.keyboard.press("Shift+Enter");

  await expect(line(page, "a 5")).toBeHidden();
  await expect(line(page, "b 1")).toBeInViewport();
  expect(status(repository)).toBe("M  a.txt\n M b.txt\n");
});
