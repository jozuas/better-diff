import type { Page } from "@playwright/test";

import { commitAll, runGit, worktreeFile, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { box, button, line, openFile, selectLines } from "./panel";

// The shared daemon's diffs are in the Auto style, as no test there picks another, which shows them
// side by side in a window this wide, and inline in one this narrow.
const wide = { width: 1920, height: 720 };
const narrow = { width: 1280, height: 720 };

test.use({ viewport: wide });

function staged(repository: string): string {
  return runGit(repository, ["diff", "--cached"]);
}

// Commits `<name>.txt`, then replaces its two middle lines with two others, after an unchanged one,
// and removes the line after them.
function replaceTwo(repository: string, names: readonly string[] = ["a"]): void {
  for (const name of names) {
    writeFile(repository, `${name}.txt`, `${name} kept\n${name} old one\n${name} old two\nlast\n`);
  }

  commitAll(repository);

  for (const name of names) {
    writeFile(repository, `${name}.txt`, `${name} kept\n${name} new one\n${name} new two\n`);
  }
}

test("side by side, removals are on the left level with additions on the right, and inline above them", async ({
  app,
  page,
  repository,
}) => {
  replaceTwo(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(line(page, "a kept")).toHaveCount(2);
  await expect(line(page, "last")).toHaveCount(1);

  const oldOne = await box(line(page, "a old one"));
  const newOne = await box(line(page, "a new one"));
  const oldTwo = await box(line(page, "a old two"));
  const newTwo = await box(line(page, "a new two"));
  const last = await box(line(page, "last"));

  expect(newOne.y).toBe(oldOne.y);
  expect(newTwo.y).toBe(oldTwo.y);
  expect(oldOne.x + oldOne.width).toBeLessThanOrEqual(newOne.x);
  expect(last.x).toBe(oldOne.x);
  expect(last.y).toBeGreaterThan(oldTwo.y);

  await page.setViewportSize(narrow);

  await expect(line(page, "a kept")).toHaveCount(1);

  const inlineOld = await box(line(page, "a old one"));
  const inlineNew = await box(line(page, "a new one"));
  const inlineLast = await box(line(page, "last"));

  expect(inlineNew.x).toBe(inlineOld.x);
  expect(inlineNew.y).toBeGreaterThan(inlineLast.y);
});

test("each side numbers its lines in its own version", async ({ app, page, repository }) => {
  writeFile(repository, "a.txt", "first\nremoved\nkept\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "first\nkept\n");

  await page.setViewportSize(narrow);
  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(line(page, "kept").locator("..")).toHaveText("32kept");

  await page.setViewportSize(wide);

  await expect(line(page, "kept").locator("..")).toHaveText(["3kept", "2kept"]);
  await expect(line(page, "removed").locator("..")).toHaveText("2removed");
});

// The width of the open file's diff, which its bar spans.
async function diffWidth(page: Page, path: string): Promise<number> {
  const bar = await box(page.getByRole("heading").filter({ hasText: path }));

  return bar.width;
}

// At the lines' 12-pixel font, each side of a diff 1,272 pixels wide has room for 80 characters
// beside its line numbers.
test("Auto, the default style, shows a diff side by side where each side has room beside its line numbers for a line of 80 characters, the default line length, and inline where it hasn't", async ({
  app,
  page,
  repository,
}) => {
  replaceTwo(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(line(page, "a kept")).toHaveCount(2);

  const around = wide.width - (await diffWidth(page, "a.txt"));

  await page.setViewportSize({ width: around + 1271, height: wide.height });

  await expect(line(page, "a kept")).toHaveCount(1);
  expect(await diffWidth(page, "a.txt")).toBe(1271);

  await page.setViewportSize({ width: around + 1272, height: wide.height });

  await expect(line(page, "a kept")).toHaveCount(2);
  expect(await diffWidth(page, "a.txt")).toBe(1272);
});

test("a group's view shows its files' diffs side by side too, and inline where it's narrow", async ({
  app,
  page,
  repository,
}) => {
  replaceTwo(repository, ["a", "b"]);

  await app.openPanel();
  await button(page, "MODIFIED FILES (2)").click();

  await expect(line(page, "a kept")).toHaveCount(2);
  await expect(line(page, "b kept")).toHaveCount(2);

  await page.setViewportSize(narrow);

  await expect(line(page, "a kept")).toHaveCount(1);
  await expect(line(page, "b kept")).toHaveCount(1);
});

test("side by side, removals and additions are separate texts: a selection has only the side it's in", async ({
  app,
  page,
  repository,
}) => {
  replaceTwo(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectLines(page, "a old one", "a old two");

  await expect
    .poll(async () => {
      const selected = await page.evaluate("window.getSelection().toString()");

      return selected;
    })
    .toBe("a old one\na old two");

  await selectLines(page, "a new one", "a new two");

  await expect
    .poll(async () => {
      const selected = await page.evaluate("window.getSelection().toString()");

      return selected;
    })
    .toBe("a new one\na new two");
});

test("side by side, staging lines selected on the left stages only removals", async ({
  app,
  page,
  repository,
}) => {
  replaceTwo(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectLines(page, "a old one", "last");
  await button(page, "Stage Lines").click();

  await expect(page.getByRole("heading", { name: "STAGED FILES (1)" })).toBeVisible();
  expect(staged(repository)).toContain("-a old one\n-a old two\n-last\n");
  expect(staged(repository)).not.toContain("+a new");
});

test("side by side, staging lines selected on the right stages only additions", async ({
  app,
  page,
  repository,
}) => {
  replaceTwo(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectLines(page, "a new two");
  await button(page, "Stage Lines").click();

  await expect(page.getByRole("heading", { name: "STAGED FILES (1)" })).toBeVisible();
  expect(staged(repository)).toMatch(/^\+a new two$/mu);
  expect(staged(repository)).not.toMatch(/^[-+](?:a old|a new one|last)/mu);
});

test("side by side, a selection is in the side it starts in, though it ends in the other", async ({
  app,
  page,
  repository,
}) => {
  replaceTwo(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectLines(page, "a old two", "a new two");
  await button(page, "Discard Lines").click();
  await button(page, "Confirm discard?").click();

  await expect(line(page, "a old two")).toHaveCount(2);
  expect(worktreeFile(repository, "a.txt")?.toString()).toBe(
    "a kept\na old two\na new one\na new two\n",
  );
});

// Commits `a.txt` as lines "a 1" to "a 60", then changes lines 10 and 40, which makes two hunks.
function changeTwoHunks(repository: string): void {
  const lines = Array.from({ length: 60 }, (_, index) => `a ${index + 1}`);

  writeFile(repository, "a.txt", `${lines.join("\n")}\n`);
  commitAll(repository);
  writeFile(repository, "a.txt", `${lines.with(9, "a first").with(39, "a second").join("\n")}\n`);
}

test("side by side, staging a hunk stages only it, and the next hunk takes its place", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await line(page, "a first").hover();

  const stageHunk = button(page, "Stage Hunk");
  const before = await box(stageHunk.first());

  await stageHunk.first().click();

  await expect(stageHunk).toHaveCount(1);
  await expect(line(page, "a second")).toBeInViewport();

  const after = await box(stageHunk);

  expect(after.y).toBe(before.y);
  expect(staged(repository)).toContain("-a 10\n+a first\n");
  expect(staged(repository)).not.toContain("a second");
});

test('side by side, "Show entire file" shows the unchanged lines around the hunks on both sides', async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await line(page, "a first").hover();
  await button(page, "Show entire file").first().click();

  await expect(line(page, "a 1")).toHaveCount(2);
  await expect(line(page, "a 25")).toHaveCount(2);
  await expect(line(page, "a 60")).toHaveCount(2);
});

// Commits `a.txt` as lines "a 1" to "a 200", then changes lines 10 to 49 and 100 to 139, which
// makes two hunks, each of 40 removed lines and 40 added ones, which take 40 rows side by side
// rather than 80.
function changeTwoLongHunks(repository: string): void {
  const lines = Array.from({ length: 200 }, (_, index) => `a ${index + 1}`);

  writeFile(repository, "a.txt", `${lines.join("\n")}\n`);
  commitAll(repository);

  const changed = lines.map((text, index) =>
    (index >= 9 && index < 49) || (index >= 99 && index < 139) ? `${text} changed` : text,
  );

  writeFile(repository, "a.txt", `${changed.join("\n")}\n`);
}

// An element on the page, which the tests typecheck without the DOM library to describe.
interface Scrollable {
  scrollIntoView: (options: { block: "start" }) => void;
}

// Scrolls the line's view to show the line at its top.
async function scrollToTop(page: Page, text: string): Promise<void> {
  await line(page, text)
    .first()
    .evaluate((shown: Scrollable) => {
      shown.scrollIntoView({ block: "start" });
    });
}

test("a change of width that switches between inline and side by side keeps what's at the top of a file's diff in place", async ({
  app,
  page,
  repository,
}) => {
  changeTwoLongHunks(repository);

  await page.setViewportSize(narrow);
  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await scrollToTop(page, "a 98");

  const inline = await box(line(page, "a 98"));

  await page.setViewportSize(wide);

  await expect(line(page, "a 98")).toHaveCount(2);

  const sideBySide = await box(line(page, "a 98").first());

  expect(sideBySide.y).toBe(inline.y);

  await page.setViewportSize(narrow);

  await expect(line(page, "a 98")).toHaveCount(1);

  const back = await box(line(page, "a 98"));

  expect(back.y).toBe(inline.y);
});

test("a change of width that switches between inline and side by side keeps what's at the top of a group's view in place", async ({
  app,
  page,
  repository,
}) => {
  changeTwoLongHunks(repository);

  await page.setViewportSize(narrow);
  await app.openPanel();
  await button(page, "MODIFIED FILES (1)").click();
  await scrollToTop(page, "a 98");

  const inline = await box(line(page, "a 98"));

  await page.setViewportSize(wide);

  await expect(line(page, "a 98")).toHaveCount(2);

  const sideBySide = await box(line(page, "a 98").first());

  expect(sideBySide.y).toBe(inline.y);
});
