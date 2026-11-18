import { commitAll, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { status } from "./keyboard";
import { button, group, openFile, row } from "./panel";

// Commits `a.txt` and `b.txt`, changes both, and adds `c.txt`.
function changeTwoAddOne(repository: string): void {
  writeFile(repository, "a.txt", "a\n");
  writeFile(repository, "b.txt", "b\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "changed a\n");
  writeFile(repository, "b.txt", "changed b\n");
  writeFile(repository, "c.txt", "c\n");
}

test("Enter in a file's row stages the file, and focus moves to the row of the file the view moves on to, so Enter stages one file after another, and Backspace discards one once pressed again to confirm", async ({
  app,
  page,
  repository,
}) => {
  changeTwoAddOne(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");
  await page.keyboard.press("Enter");

  await expect(group(page, "STAGED FILES (1)")).toHaveText(["a.txt"]);
  await expect(button(page, "b.txt")).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(group(page, "STAGED FILES (2)")).toHaveText(["a.txt", "b.txt"]);
  await expect(button(page, "c.txt")).toBeFocused();

  await page.keyboard.press("Backspace");

  await expect(button(page, "Confirm delete?")).toBeVisible();
  expect(status(repository)).toBe("M  a.txt\nM  b.txt\n?? c.txt\n");

  await page.keyboard.press("Backspace");

  await expect(group(page, "UNTRACKED FILES (0)")).toHaveCount(0);
  await expect(button(page, "c.txt")).toBeHidden();
  expect(status(repository)).toBe("M  a.txt\nM  b.txt\n");
});

test("in STAGED, Enter and Backspace in a file's row unstage the file, and Enter in a selected file's row stages the selected files", async ({
  app,
  page,
  repository,
}) => {
  changeTwoAddOne(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Enter");

  await expect(group(page, "STAGED FILES (2)")).toHaveText(["a.txt", "b.txt"]);
  expect(status(repository)).toBe("M  a.txt\nM  b.txt\n?? c.txt\n");

  await openFile(page, "STAGED FILES (2)", "a.txt");
  await page.keyboard.press("Enter");

  await expect(group(page, "STAGED FILES (1)")).toHaveText(["b.txt"]);
  await expect(button(page, "b.txt")).toBeFocused();

  await page.keyboard.press("Backspace");

  await expect(group(page, "MODIFIED FILES (2)")).toHaveText(["a.txt", "b.txt"]);
  expect(status(repository)).toBe(" M a.txt\n M b.txt\n?? c.txt\n");
});

test("with focus on one of a row's buttons, as after a click on it, Enter presses that button rather than stage the row's file", async ({
  app,
  page,
  repository,
}) => {
  changeTwoAddOne(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");
  await row(page, "MODIFIED FILES (2)", "a.txt")
    .getByRole("button", { name: "Discard a.txt" })
    .click();
  await expect(button(page, "Confirm discard?")).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(group(page, "MODIFIED FILES (1)")).toHaveText(["b.txt"]);
  expect(status(repository)).toBe(" M b.txt\n?? c.txt\n");
});
