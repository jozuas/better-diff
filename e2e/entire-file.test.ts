import type { Locator, Page } from "@playwright/test";

import { commitAll, runGit, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { hunkBar } from "./keyboard";
import { changeLines } from "./numbered";
import { box, button, line, openFile, selectLines } from "./panel";

function staged(repository: string): string {
  return runGit(repository, ["diff", "--cached"]);
}

function linesOf(name: string): string[] {
  return Array.from({ length: 200 }, (_, index) => `${name} ${index + 1}`);
}

// Commits each file `<name>.txt` as lines "<name> 1" to "<name> 200", then changes line 100 to
// "<name> first" and line 150 to "<name> second", which makes two hunks, with more unchanged lines
// before, between and after them than the view shows.
function changeTwoHunks(repository: string, names: readonly string[] = ["a"]): void {
  for (const name of names) {
    writeFile(repository, `${name}.txt`, `${linesOf(name).join("\n")}\n`);
  }

  commitAll(repository);

  for (const name of names) {
    const changed = linesOf(name).with(99, `${name} first`).with(149, `${name} second`);

    writeFile(repository, `${name}.txt`, `${changed.join("\n")}\n`);
  }
}

test('a hunk\'s bar shows a "Show entire file" icon on its left while the pointer is over the hunk', async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await expect(line(page, "a first")).toBeVisible();

  const toggle = button(page, "Show entire file");

  await expect(toggle.first()).toHaveCSS("opacity", "0");
  await line(page, "a first").hover();
  await expect(toggle.first()).toHaveCSS("opacity", "1");
  await expect(toggle.last()).toHaveCSS("opacity", "0");
  await expect(toggle.first()).toHaveText("");
  await expect(toggle.first().locator("svg")).toHaveCount(1);

  const shown = await box(toggle.first());
  const actions = await box(button(page, "Discard Hunk").first());
  const fileBar = await box(page.getByRole("heading", { name: "MODIFIED a.txt" }));

  expect(shown.x + shown.width).toBeLessThan(actions.x);
  expect(shown.x - fileBar.x).toBeLessThan(20);

  await page.mouse.move(0, 0);

  await expect(toggle.first()).toHaveCSS("opacity", "0");
});

test('"Show entire file" shows the unchanged lines around the hunks, and "Show only modified hunks" only the hunks again, leaving the hunk where it was', async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await line(page, "a second").hover();

  const before = await box(button(page, "Show entire file").last());
  const entireIcon = await button(page, "Show entire file").last().locator("svg").innerHTML();

  await button(page, "Show entire file").last().click();

  await expect(line(page, "a 1")).toBeVisible();
  await expect(line(page, "a 125")).toBeVisible();
  await expect(line(page, "a 200")).toBeVisible();
  await expect(button(page, "Show only modified hunks")).toHaveCount(2);

  const entire = await box(button(page, "Show only modified hunks").last());

  const hunksIcon = await button(page, "Show only modified hunks")
    .last()
    .locator("svg")
    .innerHTML();

  expect(entire.y).toBe(before.y);
  expect(hunksIcon).not.toBe(entireIcon);

  await button(page, "Show only modified hunks").last().click();

  await expect(line(page, "a 125")).toBeHidden();
  await expect(line(page, "a 1")).toBeHidden();
  await expect(button(page, "Show entire file")).toHaveCount(2);

  const hunks = await box(button(page, "Show entire file").last());

  expect(hunks.y).toBe(before.y);
});

// The count on a hunk's bar of the unchanged lines left out before it.
function countOn(page: Page, hunk: number, count: number): Locator {
  return hunkBar(page, "a.txt", hunk).getByRole("button", {
    name: `${String(count)} unchanged lines`,
    exact: true,
  });
}

function counts(page: Page): Locator {
  return page.getByRole("button", { name: /^\d+ unchanged lines?$/u });
}

test("while the unchanged lines before a hunk, after the hunk before it, are left out, its bar says how many, and pressing that shows only them, leaving the hunk where it was", async ({
  app,
  page,
  repository,
}) => {
  changeLines(repository, [100, 110, 130, 150, 170, 190]);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(countOn(page, 1, 96)).toBeVisible();
  await expect(countOn(page, 2, 3)).toBeVisible();
  await expect(countOn(page, 3, 13)).toBeVisible();
  await expect(counts(page)).toHaveCount(6);

  const before = await box(hunkBar(page, "a.txt", 2));

  await countOn(page, 2, 3).click();

  await expect(line(page, "a 104")).toBeVisible();
  await expect(line(page, "a 106")).toBeVisible();
  await expect(line(page, "a 96")).toBeHidden();
  await expect(line(page, "a 120")).toBeHidden();
  await expect(counts(page)).toHaveCount(5);
  await expect(button(page, "Show entire file")).toHaveCount(6);

  const after = await box(hunkBar(page, "a.txt", 2));

  expect(after.y).toBe(before.y);
});

test("how many unchanged lines are left out before a hunk is in the middle of its bar, and in a narrow panel clear of what's either side of it", async ({
  app,
  page,
  repository,
}) => {
  changeLines(repository, [100]);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  const count = countOn(page, 1, 96);
  const bar = await box(hunkBar(page, "a.txt"));
  const shown = await box(count);

  expect(Math.abs(shown.x + shown.width / 2 - (bar.x + bar.width / 2))).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 1000, height: 720 });
  await line(page, "a 100 changed").hover();
  await expect(button(page, "Discard Hunk")).toHaveCSS("opacity", "1");

  const narrow = await box(count);
  const toggle = await box(button(page, "Show entire file"));
  const actions = await box(button(page, "Discard Hunk"));

  expect(toggle.x + toggle.width).toBeLessThanOrEqual(narrow.x);
  expect(narrow.x + narrow.width).toBeLessThanOrEqual(actions.x);
});

test('"Show entire file" shows every unchanged line, though some already show, and "Show only modified hunks" then none of them', async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await countOn(page, 2, 43).click();
  await expect(line(page, "a 125")).toBeVisible();
  await line(page, "a second").hover();
  await button(page, "Show entire file").last().click();

  await expect(line(page, "a 50")).toBeVisible();
  await expect(line(page, "a 200")).toBeVisible();
  await expect(counts(page)).toHaveCount(0);
  await expect(button(page, "Show only modified hunks")).toHaveCount(2);

  await button(page, "Show only modified hunks").last().click();

  await expect(line(page, "a 125")).toBeHidden();
  await expect(line(page, "a 50")).toBeHidden();
  await expect(counts(page)).toHaveCount(2);
});

test("the unchanged lines shown before a hunk stay shown as a hunk above it is staged", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await countOn(page, 2, 43).click();
  await expect(line(page, "a 125")).toBeVisible();
  await line(page, "a first").hover();
  await button(page, "Stage Hunk").first().click();

  await expect(page.getByRole("heading", { name: "STAGED FILES (1)" })).toBeVisible();
  expect(staged(repository)).toContain("-a 100\n+a first\n");
  expect(staged(repository)).not.toContain("a second");
  await expect(button(page, "Stage Hunk")).toHaveCount(1);
  await expect(line(page, "a 125")).toBeVisible();
  await expect(line(page, "a 146")).toBeVisible();
});

test("the unchanged lines shown before a hunk stay shown as lines are added above it, as by an agent", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await countOn(page, 2, 43).click();
  await expect(line(page, "a 125")).toBeVisible();

  const changed = linesOf("a").with(99, "a first").with(149, "a second");

  writeFile(repository, "a.txt", `${["a added", ...changed].join("\n")}\n`);

  await expect(line(page, "a added")).toBeVisible();
  await expect(line(page, "a 125")).toBeVisible();
  await expect(hunkBar(page, "a.txt", 3)).toBeVisible();
  await expect(
    hunkBar(page, "a.txt", 3).getByRole("button", { name: /unchanged lines?$/u }),
  ).toHaveCount(0);
  await expect(counts(page)).toHaveCount(1);
});

test("the unchanged lines shown before a hunk don't carry over to the next file", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository, ["a", "b"]);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");
  await countOn(page, 2, 43).click();
  await expect(line(page, "a 125")).toBeVisible();
  await openFile(page, "MODIFIED FILES (2)", "b.txt");

  await expect(line(page, "b first")).toBeVisible();
  await expect(line(page, "b 125")).toBeHidden();

  await openFile(page, "MODIFIED FILES (2)", "a.txt");

  await expect(line(page, "a first")).toBeVisible();
  await expect(line(page, "a 125")).toBeHidden();
  await expect(countOn(page, 2, 43)).toBeVisible();
});

test("every file opens showing only modified hunks: the toggle doesn't carry over to the next file", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository, ["a", "b"]);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");
  await line(page, "a first").hover();
  await button(page, "Show entire file").first().click();

  await expect(line(page, "a 125")).toBeVisible();

  await openFile(page, "MODIFIED FILES (2)", "b.txt");

  await expect(line(page, "b first")).toBeVisible();
  await expect(line(page, "b 125")).toBeHidden();
  await expect(button(page, "Show only modified hunks")).toHaveCount(0);

  await openFile(page, "MODIFIED FILES (2)", "a.txt");

  await expect(line(page, "a first")).toBeVisible();
  await expect(line(page, "a 125")).toBeHidden();
});

test("staging a hunk while the entire file shows stages only it, and the next hunk takes its place", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await line(page, "a first").hover();
  await button(page, "Show entire file").first().click();

  const stageHunk = button(page, "Stage Hunk");
  const before = await box(stageHunk.first());

  await stageHunk.first().click();

  await expect(stageHunk).toHaveCount(1);
  await expect(line(page, "a 100")).toBeHidden();
  await expect(line(page, "a second")).toBeInViewport();
  await expect(button(page, "Show only modified hunks")).toHaveCount(1);

  const after = await box(stageHunk);

  expect(after.y).toBe(before.y);
  expect(staged(repository)).toContain("-a 100\n+a first\n");
  expect(staged(repository)).not.toContain("a second");
});

test("in a group's view, \"Show entire file\" shows the entire file of only the file whose hunk it's on, leaving the hunk where it was", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository, ["a", "b"]);

  await app.openPanel();
  await button(page, "MODIFIED FILES (2)").click();
  await line(page, "a first").hover();

  const before = await box(button(page, "Show entire file").first());

  await button(page, "Show entire file").first().click();

  await expect(line(page, "a 125")).toBeVisible();
  await expect(line(page, "b 125")).toBeHidden();
  await expect(button(page, "Show only modified hunks")).toHaveCount(2);
  await expect(button(page, "Show entire file")).toHaveCount(2);

  const after = await box(button(page, "Show only modified hunks").first());

  expect(after.y).toBe(before.y);
});

test("while the entire file shows, a selection reaching into a hunk from the unchanged lines before it selects only the hunk's lines", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await line(page, "a first").hover();
  await button(page, "Show entire file").first().click();
  await line(page, "a 95").scrollIntoViewIfNeeded();
  await selectLines(page, "a 95", "a first");
  await button(page, "Stage Lines").click();

  await expect(page.getByRole("heading", { name: "STAGED FILES (1)" })).toBeVisible();
  expect(staged(repository)).toContain("-a 100\n+a first\n");
  expect(staged(repository)).not.toMatch(/^[-+]a (?:9\d|second)$/mu);
});
