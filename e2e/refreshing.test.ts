import { join } from "node:path";

import type { Page } from "@playwright/test";

import { commitAll, inDirectory, makeUnreadable, runGit, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { box, button, group, line, openFile, scrollToTop } from "./panel";

test("a change nothing tells of, as to a file outside the worktree that git reads, shows once the window regains focus", async ({
  app,
  page,
  repository,
}) => {
  await inDirectory(async (outside) => {
    writeFile(outside, "exclude", "");
    runGit(repository, ["config", "core.excludesFile", join(outside, "exclude")]);
    writeFile(repository, "a.log", "a\n");

    await app.openPanel();

    await expect(group(page, "UNTRACKED FILES (1)")).toHaveText(["a.log"]);

    writeFile(outside, "exclude", "*.log\n");
    await app.focus();

    await expect(page.getByRole("heading", { name: "UNTRACKED FILES (0)" })).toBeVisible();
  });
});

test("a diff that can't be read again stays shown, under why it couldn't be, as it may be out of date", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "the line\n");

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", "a.txt");

  await expect(line(page, "the line")).toBeVisible();

  makeUnreadable(repository, "a.txt");
  writeFile(repository, "b.txt", "b\n");

  await expect(group(page, "UNTRACKED FILES (2)")).toHaveText(["a.txt", "b.txt"]);
  await expect(
    page.getByText(/^Couldn't read this again, so it may be out of date: /u),
  ).toBeVisible();
  await expect(line(page, "the line")).toBeVisible();
});

// Lines `<name> 1` to `<name> <count>`.
function numbered(name: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${name} ${index + 1}`);
}

function writeLines(repository: string, path: string, lines: readonly string[]): void {
  writeFile(repository, path, `${lines.join("\n")}\n`);
}

// How far down the page the top of the line with the text is.
async function topOf(page: Page, text: string): Promise<number> {
  const { y } = await box(line(page, text));

  return y;
}

// Commits each `<name>.txt` with 300 lines, then changes lines 10 to 19 and 200 to 239 of it, so
// that its diff has two hunks, far apart. The lines of each file, as changed.
function changeTwoHunks(repository: string, names: readonly string[]): string[][] {
  for (const name of names) {
    writeLines(repository, `${name}.txt`, numbered(name, 300));
  }

  commitAll(repository);

  return names.map((name) => {
    const changed = numbered(name, 300).map((text, index) =>
      (index >= 9 && index < 19) || (index >= 199 && index < 239) ? `${text} changed` : text,
    );

    writeLines(repository, `${name}.txt`, changed);

    return changed;
  });
}

test("the line at the top of a file's view stays in place as an agent's change adds or removes lines above it", async ({
  app,
  page,
  repository,
}) => {
  const [lines = []] = changeTwoHunks(repository, ["a"]);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await scrollToTop(page, "a 210 changed");

  const y = await topOf(page, "a 210 changed");

  writeLines(repository, "a.txt", [
    ...lines.slice(0, 2),
    ...numbered("new", 20),
    ...lines.slice(2),
  ]);

  await expect(line(page, "new 1")).toHaveCount(1);
  expect(await topOf(page, "a 210 changed")).toBe(y);

  writeLines(repository, "a.txt", [...lines.slice(0, 14), ...lines.slice(18)]);

  await expect(line(page, "new 1")).toHaveCount(0);
  expect(await topOf(page, "a 210 changed")).toBe(y);
});

test("in a group's view, the line at its top stays in place as an agent's change adds lines to the diffs above it, or a file", async ({
  app,
  page,
  repository,
}) => {
  const [lines = []] = changeTwoHunks(repository, ["b", "c"]);

  await app.openPanel();
  await button(page, "MODIFIED FILES (2)").click();
  await scrollToTop(page, "c 210 changed");

  const y = await topOf(page, "c 210 changed");

  writeLines(repository, "b.txt", [
    ...lines.slice(0, 2),
    ...numbered("new", 20),
    ...lines.slice(2),
  ]);

  await expect(line(page, "new 1")).toHaveCount(1);
  expect(await topOf(page, "c 210 changed")).toBe(y);

  writeLines(repository, "a.txt", numbered("added", 20));
  runGit(repository, ["add", "--intent-to-add", "a.txt"]);

  await expect(line(page, "added 1")).toHaveCount(1);
  expect(await topOf(page, "c 210 changed")).toBe(y);
});

test("once the line at the top of the view is gone, the line that takes its place is there instead", async ({
  app,
  page,
  repository,
}) => {
  const [lines = []] = changeTwoHunks(repository, ["a"]);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await scrollToTop(page, "a 210 changed");

  const y = await topOf(page, "a 210 changed");

  writeLines(repository, "a.txt", [
    ...numbered("new", 5),
    ...lines.slice(0, 205),
    ...numbered("rewritten", 10),
    ...lines.slice(215),
  ]);

  await expect(line(page, "rewritten 1")).toHaveCount(1);
  expect(await topOf(page, "rewritten 5")).toBe(y);
});

test("in a group's view, once the file at the top of the view leaves the group, the next file's diff takes its place", async ({
  app,
  page,
  repository,
}) => {
  const [lines = []] = changeTwoHunks(repository, ["a", "b", "c"]);

  await app.openPanel();
  await button(page, "MODIFIED FILES (3)").click();
  await scrollToTop(page, "b 210 changed");

  const y = await topOf(page, "b 210 changed");
  const bar = await box(page.getByRole("heading", { name: "MODIFIED c.txt" }));
  const below = (await topOf(page, "c 10 changed")) - (bar.y + bar.height);

  writeLines(repository, "a.txt", [
    ...lines.slice(0, 2),
    ...numbered("new", 20),
    ...lines.slice(2),
  ]);
  runGit(repository, ["checkout", "--", "b.txt"]);

  await expect(line(page, "new 1")).toHaveCount(1);
  await expect(line(page, "b 210 changed")).toHaveCount(0);
  expect(await topOf(page, "c 10 changed")).toBe(y + below);
});

test("once the open file's group has no file left, the view moves on to the first file the sidebar lists in a group below, or else to the first it lists", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "changed\n");
  writeFile(repository, "b.txt", "untracked\n");

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", "b.txt");
  await button(page, "Stage").click();

  await expect(page.getByRole("heading", { name: "STAGED b.txt" })).toBeVisible();
  await expect(line(page, "untracked")).toBeVisible();
  expect(runGit(repository, ["status", "--porcelain"])).toBe(" M a.txt\nA  b.txt\n");

  await button(page, "Unstage").click();

  await expect(page.getByRole("heading", { name: "MODIFIED a.txt" })).toBeVisible();
  await expect(line(page, "changed")).toBeVisible();
  expect(runGit(repository, ["status", "--porcelain"])).toBe(" M a.txt\n?? b.txt\n");
});
