import { writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { changeTwoHunks, changeTwoTallHunks, fileBar, hunkBar } from "./keyboard";
import { box, button, line, openFile } from "./panel";

test("E in a hunk's bar or lines shows the unchanged lines above the hunk, or hides them again, as the middle of its bar does", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  // Line 5, between the hunks.
  const unchanged = page.locator(`[id$=":new 5"]`).first();

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await hunkBar(page, "a.txt", 2).focus();
  await page.keyboard.press("e");

  await expect(unchanged).toBeVisible();
  await expect(button(page, "Hide 1 unchanged line")).toBeAttached();
  await expect(button(page, "Show only modified hunks")).toHaveCount(0);

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("e");

  await expect(unchanged).toBeHidden();
  await expect(button(page, "1 unchanged line")).toBeVisible();
  await expect(line(page, "last")).toBeVisible();

  await page.keyboard.press("e");

  await expect(unchanged).toBeVisible();
});

test("E with a hunk's bar at the top of the view scrolls the view up to show the unchanged lines it shows above the hunk, as many as fit with the bar no lower than the view's middle", async ({
  app,
  page,
  repository,
}) => {
  changeTwoTallHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await hunkBar(page, "a.txt").focus();
  await page.keyboard.press("ArrowDown");

  const bar = hunkBar(page, "a.txt", 2);

  await expect(bar).toBeFocused();
  await expect(line(page, "line 58")).toBeInViewport();

  const top = await box(bar);

  await page.keyboard.press("e");

  await expect(line(page, "line 57")).toBeInViewport();
  await expect(line(page, "line 14")).not.toBeInViewport();
  await expect(bar).toBeFocused();
  await expect(bar).toBeInViewport();

  const shown = await box(bar);
  const view = await box(page.locator("body"));

  expect(shown.y).toBeGreaterThan(top.y);
  expect(shown.y).toBeLessThanOrEqual(top.y + view.height / 2);
});

test("Shift+E in a hunk's bar or lines shows the entire file, or only the modified hunks again, and E in a collapsed file's bar shows its diff", async ({
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
  await page.keyboard.press("Shift+E");

  await expect(unchanged).toBeVisible();
  await expect(button(page, "Show only modified hunks").first()).toBeAttached();

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+E");

  await expect(unchanged).toBeHidden();
  await expect(button(page, "Show entire file").first()).toBeAttached();

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

  // Line 5, between the hunks.
  const unchanged = page.locator(`[id$=":new 5"]`).first();

  await app.openPanel();
  await hunkBar(page, "a.txt", 2).focus();
  await hunkBar(page, "a.txt", 2).dispatchEvent("keydown", {
    key: "у",
    code: "KeyE",
    bubbles: true,
  });

  await expect(unchanged).toBeVisible();
});
