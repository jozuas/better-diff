import type { Page } from "@playwright/test";

import { commitAll, runGit, worktreeFile, writeFile } from "../test/repository";
import { changesSettings, expect, test } from "./fixtures";
import { box, button, line, openFile, selectLines, showLayout } from "./panel";

// The layout is a setting of the host's, so each test starts from the layout it sets.
changesSettings();

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

test("the file bar's button shows the diff side by side, with removals on the left level with additions on the right, and inline again", async ({
  app,
  page,
  repository,
}) => {
  replaceTwo(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await showLayout(page, "inline");
  await button(page, "Show side by side").click();

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

  await button(page, "Show inline").click();

  await expect(line(page, "a kept")).toHaveCount(1);
  await expect(button(page, "Show side by side")).toBeVisible();

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

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await showLayout(page, "inline");

  await expect(line(page, "kept").locator("..")).toHaveText("32kept");

  await button(page, "Show side by side").click();

  await expect(line(page, "kept").locator("..")).toHaveText(["3kept", "2kept"]);
  await expect(line(page, "removed").locator("..")).toHaveText("2removed");
});

test("diffs stay side by side in other files, in a group's view, and in the tab after a reload", async ({
  app,
  page,
  repository,
}) => {
  replaceTwo(repository, ["a", "b"]);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");
  await showLayout(page, "side by side");
  await openFile(page, "MODIFIED FILES (2)", "b.txt");

  await expect(line(page, "b kept")).toHaveCount(2);

  await button(page, "MODIFIED FILES (2)").click();

  await expect(line(page, "a kept")).toHaveCount(2);
  await expect(line(page, "b kept")).toHaveCount(2);
  await expect(button(page, "Show inline")).toHaveCount(2);

  await page.reload();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");

  await expect(line(page, "a kept")).toHaveCount(2);
  await expect(button(page, "Show inline")).toBeVisible();
});

// Closes the plugin's tab, whose Close button shows while the pointer is over the tab.
async function closePanel(page: Page): Promise<void> {
  await button(page, "Better Diff").first().hover();
  await button(page, "Close").click();
  await expect(page.getByRole("textbox", { name: "Filter files" })).toHaveCount(0);
}

test("Better Diff opened again shows diffs as they were last shown, in any tab", async ({
  app,
  page,
  repository,
}) => {
  replaceTwo(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await showLayout(page, "side by side");
  await closePanel(page);
  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(line(page, "a kept")).toHaveCount(2);
  await expect(button(page, "Show inline")).toBeVisible();

  await button(page, "Show inline").click();
  await closePanel(page);
  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(line(page, "a kept")).toHaveCount(1);
  await expect(button(page, "Show side by side")).toBeVisible();
});

test("side by side, removals and additions are separate texts: a selection has only the side it's in", async ({
  app,
  page,
  repository,
}) => {
  replaceTwo(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await showLayout(page, "side by side");
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
  await showLayout(page, "side by side");
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
  await showLayout(page, "side by side");
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
  await showLayout(page, "side by side");
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
  await showLayout(page, "side by side");
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
  await showLayout(page, "side by side");
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

test("switching between inline and side by side keeps what's at the top of a file's diff in place", async ({
  app,
  page,
  repository,
}) => {
  changeTwoLongHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await showLayout(page, "inline");
  await scrollToTop(page, "a 98");

  const inline = await box(line(page, "a 98"));

  await button(page, "Show side by side").click();

  await expect(line(page, "a 98")).toHaveCount(2);

  const sideBySide = await box(line(page, "a 98").first());

  expect(sideBySide.y).toBe(inline.y);

  await button(page, "Show inline").click();

  await expect(line(page, "a 98")).toHaveCount(1);

  const back = await box(line(page, "a 98"));

  expect(back.y).toBe(inline.y);
});

test("switching between inline and side by side keeps what's at the top of a group's view in place", async ({
  app,
  page,
  repository,
}) => {
  changeTwoLongHunks(repository);

  await app.openPanel();
  await button(page, "MODIFIED FILES (1)").click();
  await showLayout(page, "inline");
  await scrollToTop(page, "a 98");

  const inline = await box(line(page, "a 98"));

  await button(page, "Show side by side").click();

  await expect(line(page, "a 98")).toHaveCount(2);

  const sideBySide = await box(line(page, "a 98").first());

  expect(sideBySide.y).toBe(inline.y);
});
