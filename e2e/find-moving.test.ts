import { commitAll, runGit, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { hunkBar } from "./keyboard";
import { button, findInput, found, line, openFile, openFind, scrollToTop } from "./panel";

function status(repository: string): string {
  return runGit(repository, ["status", "--porcelain", "--untracked-files=all"]);
}

// The key that moves to the next match: ⌘G on a Mac, and F3 elsewhere.
const findNext = process.platform === "darwin" ? "Meta+g" : "F3";

// The file's lines, from "line 1" to "line <count>", but for "needle <number>" at each of the
// numbers.
function linesWithNeedles(count: number, needles: readonly number[]): string {
  return Array.from({ length: count }, (_, index) =>
    needles.includes(index + 1) ? `needle ${index + 1}\n` : `line ${index + 1}\n`,
  ).join("");
}

test("typing in the find bar makes the current match the first at or after the one that was", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "ab\nab\na\n");

  await app.openPanel();
  await openFind(page, "a");
  await findInput(page).pressSequentially("a");

  await expect(page.getByText("1 of 3", { exact: true })).toBeVisible();

  await findInput(page).press("Enter");
  await findInput(page).pressSequentially("b");

  await expect(page.getByText("2 of 2", { exact: true })).toBeVisible();
});

test("with no current match, typing in the find bar makes current the first match at or after the line at the top of the view", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", linesWithNeedles(200, [5, 150]));

  await app.openPanel();
  await scrollToTop(page, "line 100");
  await openFind(page, "line 100");
  await findInput(page).pressSequentially("needle");

  await expect(page.getByText("2 of 2", { exact: true })).toBeVisible();
  await expect(line(page, "needle 150")).toBeInViewport();
});

test("Enter and Shift+Enter in the find bar, its ↓ and ↑ buttons, and ⌘G, or F3 elsewhere, move to the next match or the one before, round from the last to the first, and each shows", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", linesWithNeedles(200, [5, 100, 190]));

  await app.openPanel();
  await openFind(page, "line 1");
  await findInput(page).pressSequentially("needle");

  await expect(page.getByText("1 of 3", { exact: true })).toBeVisible();

  await findInput(page).press("Enter");

  await expect(page.getByText("2 of 3", { exact: true })).toBeVisible();
  await expect(line(page, "needle 100")).toBeInViewport();

  await button(page, "Next match").click();

  await expect(page.getByText("3 of 3", { exact: true })).toBeVisible();
  await expect(line(page, "needle 190")).toBeInViewport();

  await page.keyboard.press(findNext);

  await expect(page.getByText("1 of 3", { exact: true })).toBeVisible();
  await expect(line(page, "needle 5")).toBeInViewport();

  await findInput(page).press("Shift+Enter");

  await expect(page.getByText("3 of 3", { exact: true })).toBeVisible();

  await button(page, "Previous match").click();

  await expect(page.getByText("2 of 3", { exact: true })).toBeVisible();
  await expect(line(page, "needle 100")).toBeInViewport();
});

test("a match in the entire file shows, though the lines around it weren't rendered yet", async ({
  app,
  page,
  repository,
}) => {
  const lines = Array.from({ length: 3000 }, (_, index) => `line ${index + 1}`);

  lines[2899] = "far needle";
  writeFile(repository, "a.txt", `${lines.join("\n")}\n`);
  commitAll(repository);
  lines[1] = "changed";
  writeFile(repository, "a.txt", `${lines.join("\n")}\n`);

  await app.openPanel();
  await line(page, "changed").hover();
  await button(page, "Show entire file").first().click();
  // Past the hunk's context, so the entire file shows.
  await expect(line(page, "line 6")).toBeVisible();
  await openFind(page, "changed");
  await findInput(page).pressSequentially("far needle");

  await expect(page.getByText("1 of 1", { exact: true })).toBeVisible();
  await expect(line(page, "far needle")).toBeInViewport();
});

test("Escape in the find bar closes it and clears the highlights, and focus goes back where it was before it opened", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\nb\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "a needle\nb\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await expect(line(page, "a needle")).toBeVisible();
  await page.keyboard.press("ArrowRight");

  await expect(hunkBar(page, "a.txt")).toBeFocused();

  await page.keyboard.press("ControlOrMeta+f");
  await findInput(page).pressSequentially("needle");

  await expect(found(page, "needle")).toHaveCount(1);

  await findInput(page).press("Escape");

  await expect(findInput(page)).toHaveCount(0);
  await expect(found(page, "needle")).toHaveCount(0);
  await expect(hunkBar(page, "a.txt")).toBeFocused();
  expect(status(repository)).toBe(" M a.txt\n");
});

test("the find bar's × closes it and clears the highlights, and keys reach the panel then", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a needle\nb\n");

  await app.openPanel();
  await openFind(page, "b");
  await findInput(page).pressSequentially("needle");
  await button(page, "Close find").click();

  await expect(findInput(page)).toHaveCount(0);
  await expect(found(page, "needle")).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+f");

  await expect(findInput(page)).toBeFocused();
});

test("keys in the find bar only find: Enter doesn't stage there, nor Backspace discard", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\nb\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "a needle\nb\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await expect(line(page, "a needle")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ControlOrMeta+f");
  await findInput(page).pressSequentially("needles");
  await findInput(page).press("Backspace");
  await findInput(page).press("Enter");
  await findInput(page).press("Shift+Enter");
  await findInput(page).press("Shift+Backspace");

  await expect(findInput(page)).toHaveValue("needl");
  await expect(line(page, "a needle")).toBeVisible();
  expect(status(repository)).toBe(" M a.txt\n");
  expect(runGit(repository, ["diff", "--cached"])).toBe("");
});

test("as the diff changes, the find bar's highlights follow, and the current match is the first at or after where it was", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "x needle\ny needle\n");

  await app.openPanel();
  await openFind(page, "y needle");
  await findInput(page).pressSequentially("needle");
  await findInput(page).press("Enter");

  await expect(page.getByText("2 of 2", { exact: true })).toBeVisible();

  writeFile(repository, "a.txt", "needle first\nx needle\ny needle\n");

  await expect(found(page, "needle")).toHaveCount(3);
  await expect(page.getByText("2 of 3", { exact: true })).toBeVisible();
});
