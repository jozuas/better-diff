import type { Locator, Page } from "@playwright/test";

import { commitAll, indexFile, runGit, worktreeFile, writeFile } from "../test/repository";
import { changesSettings, expect, test as base } from "./fixtures";
import { box, button, line, openFile } from "./panel";

// The switch on Better Diff's page in Paseo's settings.
function hiding(page: Page): Locator {
  return page.getByRole("switch", { name: "Hide whitespace", exact: true });
}

// Whether whitespace changes are hidden is the host's setting, so each test shows them again.
const test = base.extend<Record<"shownWhitespace", void>>({
  shownWhitespace: [
    async ({ app }, provide) => {
      await provide();
      await app.hideWhitespace(false);
    },
    { auto: true },
  ],
});

changesSettings();

// Lines numbered from 0, but for those at the indices, which are replaced.
function numberedLines(count: number, replaced: Record<number, string> = {}): string {
  return Array.from(
    { length: count },
    (_, index) => `${replaced[index] ?? `line ${index}`}\n`,
  ).join("");
}

// Commits `<name>.txt`, then indents its second line with a tab where it had two spaces, and changes
// its last line.
function indentAndChange(repository: string, names: readonly string[] = ["a"]): void {
  for (const name of names) {
    writeFile(repository, `${name}.txt`, `${name}\n  ${name} indented\nkept\nold\n`);
  }

  commitAll(repository);

  for (const name of names) {
    writeFile(repository, `${name}.txt`, `${name}\n\t${name} indented\nkept\nnew\n`);
  }
}

// Opens Better Diff's page in Paseo's settings on another page of the browser, which gives it.
async function otherClient(page: Page, settings: string): Promise<Page> {
  const other = await page.context().newPage();

  await other.goto(settings);

  return other;
}

test("Hide whitespace in Better Diff's settings, off by default, shows a line whose only change is to whitespace unchanged, leaves out a hunk with no other changes, and counts only the lines shown", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", numberedLines(30));
  commitAll(repository);
  writeFile(
    repository,
    "a.txt",
    numberedLines(30, { 1: "\tline 1", 3: "changed", 25: "  line 25" }),
  );

  await app.openSettings();

  await expect(hiding(page)).not.toBeChecked();

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(page.getByRole("heading", { name: "MODIFIED a.txt +3 −3" })).toBeVisible();
  await expect(line(page, "line 1")).toHaveCount(2);
  await expect(line(page, "line 25")).toHaveCount(2);

  await app.hideWhitespace(true);
  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(page.getByRole("heading", { name: "MODIFIED a.txt +1 −1" })).toBeVisible();
  await expect(line(page, "line 1")).toHaveCount(1);
  await expect(line(page, "line 25")).toHaveCount(0);
  await expect(line(page, "changed")).toBeVisible();
});

test("Hide whitespace switched on one client of the host shows at once in a Better Diff panel open on another, in every file and group it opens, and once Paseo reloads", async ({
  app,
  page,
  repository,
}) => {
  indentAndChange(repository, ["a", "b"]);

  await app.openSettings();

  const settings = page.url();

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");

  await expect(line(page, "a indented")).toHaveCount(2);

  const other = await otherClient(page, settings);

  await hiding(other).click();
  await expect(hiding(other)).toBeChecked();

  await expect(line(page, "a indented")).toHaveCount(1);

  await other.close();
  await openFile(page, "MODIFIED FILES (2)", "b.txt");

  await expect(line(page, "b indented")).toHaveCount(1);

  await button(page, "MODIFIED FILES (2)").click();

  await expect(line(page, "a indented")).toHaveCount(1);
  await expect(line(page, "b indented")).toHaveCount(1);

  await page.reload();

  await expect(line(page, "a indented")).toHaveCount(1);
  await expect(line(page, "b indented")).toHaveCount(1);
});

test("switching Hide whitespace keeps the line at the top of a Better Diff panel's view where it was", async ({
  app,
  page,
  repository,
}) => {
  // Hunks of only whitespace changes, and then one hunk taller than the view, of other changes.
  const indented = [10, 30, 50, 70, 90].map((index) => [index, `  line ${index}`] as const);
  const changed = Array.from({ length: 12 }, (_, index) => 140 + 4 * index);

  const changes = Object.fromEntries<string>([
    ...indented,
    ...changed.map((index) => [index, `changed ${index}`] as const),
  ]);

  writeFile(repository, "a.txt", numberedLines(300));
  writeFile(repository, "b.txt", "b\n");
  commitAll(repository);
  writeFile(repository, "a.txt", numberedLines(300, changes));
  writeFile(repository, "b.txt", "changed b\n");

  await app.openSettings();

  const settings = page.url();

  await app.openPanel();
  await button(page, "MODIFIED FILES (2)").click();
  await line(page, "changed 160").scrollIntoViewIfNeeded();

  const shown = await box(line(page, "changed 160"));
  const other = await otherClient(page, settings);

  await hiding(other).click();
  await expect(hiding(other)).toBeChecked();

  await expect(line(page, "line 90")).toHaveCount(0);
  expect(await box(line(page, "changed 160"))).toStrictEqual(shown);

  await hiding(other).click();
  await expect(hiding(other)).not.toBeChecked();

  await expect(line(page, "line 90")).toHaveCount(2);
  expect(await box(line(page, "changed 160"))).toStrictEqual(shown);

  await other.close();
});

test("with whitespace changes hidden, a hunk action acts only on the changes shown, and a file action on all of them", async ({
  app,
  page,
  repository,
}) => {
  indentAndChange(repository);

  await app.hideWhitespace(true);
  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(page.getByRole("heading", { name: "MODIFIED a.txt +1 −1" })).toBeVisible();

  await line(page, "new").hover();
  await button(page, "Stage Hunk").click();

  await expect(page.getByRole("heading", { name: "STAGED FILES (1)" })).toBeVisible();
  expect(indexFile(repository, "a.txt")?.toString()).toBe("a\n  a indented\nkept\nnew\n");

  await button(page, "Stage").click();

  await expect(page.getByRole("heading", { name: "MODIFIED FILES (0)" })).toBeVisible();
  expect(indexFile(repository, "a.txt")).toStrictEqual(worktreeFile(repository, "a.txt"));
});

test("with whitespace changes hidden, an action on lines git lines up differently with them shown changes nothing, and says to turn off Hide whitespace", async ({
  app,
  page,
  repository,
}) => {
  // Lines that only differ in whitespace, and far below them, a line indented, which hiding
  // whitespace changes leaves out of the counts.
  writeFile(repository, "a.txt", `  y\ny\nz\n${numberedLines(20)}w\n`);
  commitAll(repository);
  writeFile(repository, "a.txt", `y\nz\n${numberedLines(20)}  w\n`);

  await app.hideWhitespace(true);
  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(page.getByRole("heading", { name: "MODIFIED a.txt +0 −1" })).toBeVisible();

  await line(page, "z").hover();
  await button(page, "Stage Hunk").click();

  await expect(
    page.getByText(
      "With whitespace changes shown, git lines these lines up differently, so nothing was done. Turn off Hide whitespace in Better Diff's settings to stage them.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(runGit(repository, ["diff", "--cached"])).toBe("");
});

test('with whitespace changes hidden, a file whose only changes are to whitespace shows "Only whitespace changes", and its file actions stage, unstage and discard them', async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n  b\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "a\n\tb\n");

  await app.hideWhitespace(true);
  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(page.getByText("Only whitespace changes", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "MODIFIED a.txt" })).not.toContainText("−");

  await button(page, "Stage").click();

  await expect(page.getByRole("heading", { name: "STAGED FILES (1)" })).toBeVisible();
  expect(indexFile(repository, "a.txt")?.toString()).toBe("a\n\tb\n");

  await openFile(page, "STAGED FILES (1)", "a.txt");

  await expect(page.getByText("Only whitespace changes", { exact: true })).toBeVisible();

  await button(page, "Unstage").click();

  await expect(page.getByRole("heading", { name: "MODIFIED FILES (1)" })).toBeVisible();
  expect(indexFile(repository, "a.txt")?.toString()).toBe("a\n  b\n");

  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(page.getByText("Only whitespace changes", { exact: true })).toBeVisible();

  await button(page, "Discard").click();
  await button(page, "Confirm discard?").click();

  await expect(page.getByRole("heading", { name: "MODIFIED FILES (0)" })).toBeVisible();
  expect(worktreeFile(repository, "a.txt")?.toString()).toBe("a\n  b\n");
});
