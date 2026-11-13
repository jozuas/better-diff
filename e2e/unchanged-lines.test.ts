import { expect, test } from "./fixtures";
import { hunkBar } from "./keyboard";
import { changeLines, countOn, counts, writeChanged } from "./numbered";
import { box, button, line, openFile } from "./panel";

test('once the unchanged lines before a hunk show, the middle of its bar hides them again while the pointer is over the hunk, as "Hide 3 unchanged lines", leaving the hunk where it was', async ({
  app,
  page,
  repository,
}) => {
  changeLines(repository, [100, 110, 130]);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await countOn(page, 2, 3).click();
  await expect(line(page, "a 104")).toBeVisible();

  const hide = hunkBar(page, "a.txt", 2).getByRole("button", {
    name: "Hide 3 unchanged lines",
    exact: true,
  });

  await line(page, "a 130 changed").click();

  await expect(hunkBar(page, "a.txt", 3)).toBeFocused();
  await expect(hide).toHaveCSS("opacity", "0");

  await line(page, "a 110 changed").hover();

  await expect(hide).toHaveCSS("opacity", "1");

  const before = await box(hunkBar(page, "a.txt", 2));

  await hide.click();

  await expect(line(page, "a 104")).toBeHidden();
  await expect(countOn(page, 2, 3)).toBeVisible();
  await expect(counts(page)).toHaveCount(3);

  const after = await box(hunkBar(page, "a.txt", 2));

  expect(after.y).toBe(before.y);
});

test("hiding the unchanged lines before a hunk while the entire file shows leaves those before the other hunks shown, but not those after the last hunk, which show only with the entire file", async ({
  app,
  page,
  repository,
}) => {
  changeLines(repository, [100, 150]);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await line(page, "a 150 changed").hover();
  await button(page, "Show entire file").last().click();
  await expect(line(page, "a 200")).toBeVisible();
  await expect(line(page, "a 125")).toBeVisible();
  await line(page, "a 150 changed").hover();
  await button(page, "Hide 43 unchanged lines").click();

  await expect(line(page, "a 125")).toBeHidden();
  await expect(line(page, "a 200")).toBeHidden();
  await expect(line(page, "a 90")).toBeVisible();
  await expect(countOn(page, 2, 43)).toBeVisible();
  await expect(counts(page)).toHaveCount(1);
  await expect(button(page, "Show entire file")).toHaveCount(2);
});

test("E shows under the middle of a hunk's bar once the pointer rests on it, which shows or hides the unchanged lines above the hunk", async ({
  app,
  page,
  repository,
}) => {
  changeLines(repository, [100, 110]);

  const tip = page.getByRole("tooltip");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await countOn(page, 2, 3).hover();

  await expect(tip).toHaveText("E");

  await countOn(page, 2, 3).click();
  await page.mouse.move(0, 0);
  await button(page, "Hide 3 unchanged lines").hover();

  await expect(tip).toHaveText("E");

  const under = await box(button(page, "Hide 3 unchanged lines"));
  const shown = await box(tip);

  expect(shown.y).toBeGreaterThanOrEqual(under.y + under.height);
});

test("unchanged lines shown after their file changed while they were hidden are the file's lines as they are then, so the bar of a hunk the change added keeps focus as E shows the lines above it", async ({
  app,
  page,
  repository,
}) => {
  changeLines(repository, [100, 150]);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await countOn(page, 2, 43).click();
  await expect(line(page, "a 125")).toBeVisible();
  await line(page, "a 150 changed").hover();
  await button(page, "Hide 43 unchanged lines").click();
  await expect(line(page, "a 125")).toBeHidden();

  writeChanged(repository, [100, 150, 180]);

  await line(page, "a 180 changed").click();
  await expect(hunkBar(page, "a.txt", 3)).toBeFocused();
  await page.keyboard.press("e");

  await expect(line(page, "a 165")).toBeVisible();
  await expect(hunkBar(page, "a.txt", 3)).toBeFocused();
});
