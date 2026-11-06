import { writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { changeTwoHunks, fileBar, hunkBar } from "./keyboard";
import { button, line, openFile } from "./panel";

test("E in a hunk's bar shows the entire file, or only the modified hunks again, and in a collapsed file's bar shows its diff", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "package-lock.json", "{}\n");
  changeTwoHunks(repository);
  writeFile(repository, "package-lock.json", "{ locked }\n");

  // Line 5, which only the entire file shows.
  const unchanged = page.locator(`[id$=":new 5"]`).first();

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");
  await hunkBar(page, "a.txt").focus();
  await page.keyboard.press("e");

  await expect(unchanged).toBeVisible();
  await expect(button(page, "Show only modified hunks").first()).toBeAttached();

  await page.keyboard.press("e");

  await expect(unchanged).toBeHidden();

  await openFile(page, "MODIFIED FILES (2)", "package-lock.json");
  await expect(page.getByText("Generated file", { exact: true })).toBeVisible();
  await fileBar(page, "MODIFIED package-lock.json").focus();
  await page.keyboard.press("e");

  await expect(line(page, "{ locked }")).toBeVisible();
});

test("a letter's key works on a keyboard that doesn't type Latin letters, as the key where a US keyboard has the letter", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  // Line 5, which only the entire file shows.
  const unchanged = page.locator(`[id$=":new 5"]`).first();

  await app.openPanel();
  await hunkBar(page, "a.txt").focus();
  await hunkBar(page, "a.txt").dispatchEvent("keydown", { key: "у", code: "KeyE", bubbles: true });

  await expect(unchanged).toBeVisible();
});
