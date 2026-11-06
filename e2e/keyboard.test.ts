import { commitAll, makeExecutable, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import {
  changeTwoHunks,
  changeTwoTallHunks,
  fileBar,
  hunkBar,
  modeBar,
  status,
  writeLong,
} from "./keyboard";
import { box, button, line, openFile } from "./panel";

test("↓ and ↑ move focus from a file's bar to its mode change's bar and on through its hunks' bars, and the view shows each hunk from its start", async ({
  app,
  page,
  repository,
}) => {
  changeTwoTallHunks(repository);
  makeExecutable(repository, "a.txt");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await expect(modeBar(page, "a.txt")).toBeVisible();
  await fileBar(page, "MODIFIED a.txt").focus();
  await page.keyboard.press("ArrowDown");

  await expect(modeBar(page, "a.txt")).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");

  await expect(hunkBar(page, "a.txt", 2)).toBeFocused();
  await expect(line(page, "line 58")).toBeInViewport();

  const bar = await box(hunkBar(page, "a.txt", 2));
  const start = await box(line(page, "line 58"));

  expect(start.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  expect(start.y).toBeLessThan(bar.y + bar.height + 10);

  await page.keyboard.press("ArrowUp");

  await expect(hunkBar(page, "a.txt")).toBeFocused();
  await expect(line(page, "line 8")).toBeInViewport();

  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");

  await expect(fileBar(page, "MODIFIED a.txt")).toBeFocused();
  expect(status(repository)).toBe(" M a.txt\n");
});

test("in one file's view, ↓ on its last bar opens the next file, with focus on its file bar, and ↑ on the file bar opens the file before, with focus on its last bar", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "b.txt", "b\n");
  changeTwoHunks(repository);
  writeFile(repository, "b.txt", "changed b\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");
  await hunkBar(page, "a.txt", 2).focus();
  await page.keyboard.press("ArrowDown");

  await expect(fileBar(page, "MODIFIED b.txt")).toBeFocused();

  await page.keyboard.press("ArrowUp");

  await expect(hunkBar(page, "a.txt", 2)).toBeFocused();
  await expect(fileBar(page, "MODIFIED a.txt")).toBeVisible();
  expect(status(repository)).toBe(" M a.txt\n M b.txt\n");
});

test("Alt+↓ and Alt+↑ move focus to the next file's bar or the one before, in a group's view, and from one file's view to the next file's", async ({
  app,
  page,
  repository,
}) => {
  writeLong(repository, "a.txt", "a");
  writeLong(repository, "b.txt", "b");

  await app.openPanel();
  await button(page, "UNTRACKED FILES (2)").click();
  await hunkBar(page, "a.txt").focus();
  await page.keyboard.press("Alt+ArrowDown");

  await expect(fileBar(page, "UNTRACKED b.txt")).toBeFocused();
  await expect(line(page, "b 1")).toBeInViewport();
  await expect(line(page, "a 60")).not.toBeInViewport();

  await page.keyboard.press("Alt+ArrowUp");

  await expect(fileBar(page, "UNTRACKED a.txt")).toBeFocused();
  await expect(line(page, "a 1")).toBeInViewport();

  await openFile(page, "UNTRACKED FILES (2)", "a.txt");
  await hunkBar(page, "a.txt").focus();
  await page.keyboard.press("Alt+ArrowDown");

  await expect(fileBar(page, "UNTRACKED b.txt")).toBeFocused();
  expect(status(repository)).toBe("?? a.txt\n?? b.txt\n");
});

test("→ moves focus from a file's row into its diff, to its first hunk, and ← from any of the diff's bars back to the row", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await expect(line(page, "first")).toBeVisible();
  await page.keyboard.press("ArrowRight");

  await expect(hunkBar(page, "a.txt")).toBeFocused();
  await expect(button(page, "Stage Hunk").first()).toHaveCSS("opacity", "1");

  await page.keyboard.press("ArrowLeft");

  await expect(button(page, "a.txt")).toBeFocused();

  await fileBar(page, "MODIFIED a.txt").focus();
  await page.keyboard.press("ArrowLeft");

  await expect(button(page, "a.txt")).toBeFocused();
  expect(status(repository)).toBe(" M a.txt\n");
});

test("a file shown without hunks has its file bar to move focus to, where Enter stages it", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.bin", new Uint8Array([0, 1, 2]));

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", "a.bin");
  await expect(page.getByText("Binary file", { exact: true })).toBeVisible();
  await page.keyboard.press("ArrowRight");

  await expect(fileBar(page, "UNTRACKED a.bin")).toBeFocused();

  await page.keyboard.press("Enter");

  await expect.poll(() => status(repository)).toBe("A  a.bin\n");
});

test("in a group's view, ↓ moves focus from one file's last hunk to the next file's bar, and ← to the row of the file whose bar has focus", async ({
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
  await button(page, "MODIFIED FILES (2)").click();
  await hunkBar(page, "a.txt").focus();
  await page.keyboard.press("ArrowDown");

  await expect(fileBar(page, "MODIFIED b.txt")).toBeFocused();

  await page.keyboard.press("ArrowDown");

  await expect(hunkBar(page, "b.txt")).toBeFocused();

  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowLeft");

  await expect(button(page, "b.txt")).toBeFocused();
  expect(status(repository)).toBe(" M a.txt\n M b.txt\n");
});
