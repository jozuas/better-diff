import type { Locator, Page } from "@playwright/test";

import { commitAll, runGit, worktreeFile, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { button, line, openFile, selectLines, selectUpTo } from "./panel";

function staged(repository: string): string {
  return runGit(repository, ["diff", "--cached"]);
}

// Commits `a.txt` as one line, then adds three after it, in one hunk.
function addThree(repository: string): void {
  writeFile(repository, "a.txt", "kept\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "kept\nalpha\nbravo\ncharlie\n");
}

test("selecting lines shows their actions only while they're selected, and the text can still be copied", async ({
  app,
  page,
  repository,
}) => {
  addThree(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectLines(page, "bravo", "charlie");

  await expect(button(page, "Stage Lines")).toBeVisible();
  await expect(button(page, "Discard Lines")).toBeVisible();
  await expect
    .poll(async () => {
      const selected = await page.evaluate("window.getSelection().toString()");

      return selected;
    })
    .toBe("bravo\ncharlie");

  await line(page, "kept").click();

  await expect(button(page, "Stage Lines")).toBeHidden();
});

// An element on the page, which the tests typecheck without the DOM library to describe.
interface Styled {
  ownerDocument: {
    defaultView: {
      getComputedStyle: (
        element: Styled,
        pseudoElement: string | null,
      ) => { color: string; backgroundColor: string };
    };
  };
}

// The element's text and background colours, or its pseudo-element's.
async function colorsOf(
  locator: Locator,
  pseudoElement: string | null = null,
): Promise<{ color: string; background: string }> {
  const colors = await locator.evaluate((element: Styled, pseudo) => {
    const { color, backgroundColor } = element.ownerDocument.defaultView.getComputedStyle(
      element,
      pseudo,
    );

    return { color, background: backgroundColor };
  }, pseudoElement);

  return colors;
}

// A line's number, in the row of the line with the text.
function numberOf(page: Page, text: string, number: string): Locator {
  return line(page, text).locator("..").getByText(number, { exact: true });
}

test("selected text is highlighted in a faint tint of the theme's text colour, and so are the selected lines' numbers, in the theme's text colour", async ({
  app,
  page,
  repository,
}) => {
  addThree(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectLines(page, "bravo", "charlie");

  await expect(button(page, "Stage Lines")).toBeVisible();

  const { color } = await colorsOf(line(page, "bravo"));
  const tint = color.replace(/^rgb\((?<channels>.*)\)$/u, "rgba($<channels>, 0.12)");

  expect(tint).not.toBe(color);
  expect(await colorsOf(line(page, "bravo"), "::selection")).toMatchObject({ background: tint });
  await expect(numberOf(page, "bravo", "3")).toHaveCSS("background-color", tint);
  await expect(numberOf(page, "bravo", "3")).toHaveCSS("color", color);
  await expect(numberOf(page, "alpha", "2")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("a selection of lines is cleared once their diff changes, since it can cover other lines then", async ({
  app,
  page,
  repository,
}) => {
  addThree(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectLines(page, "bravo", "charlie");

  await expect(button(page, "Stage Lines")).toBeVisible();

  writeFile(repository, "a.txt", "kept\nadded\nalpha\nbravo\ncharlie\n");

  await expect(line(page, "added")).toBeVisible();
  await expect(button(page, "Stage Lines")).toBeHidden();
  await expect
    .poll(async () => {
      const selected = await page.evaluate("window.getSelection().toString()");

      return selected;
    })
    .toBe("");
});

// Commits `a.txt` and `b.txt` as one line each, then adds three lines to `a.txt` and one to
// `b.txt`.
function changeTwo(repository: string): void {
  writeFile(repository, "a.txt", "kept\n");
  writeFile(repository, "b.txt", "b\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "kept\nalpha\nbravo\ncharlie\n");
  writeFile(repository, "b.txt", "b\nchanged b\n");
}

test("in a group's view, a selection of lines is cleared once their diff changes", async ({
  app,
  page,
  repository,
}) => {
  changeTwo(repository);

  await app.openPanel();
  await button(page, "MODIFIED FILES (2)").click();
  await selectLines(page, "bravo", "charlie");

  await expect(button(page, "Stage Lines")).toBeVisible();

  writeFile(repository, "a.txt", "kept\nadded\nalpha\nbravo\ncharlie\n");

  await expect(line(page, "added")).toBeVisible();
  await expect(button(page, "Stage Lines")).toBeHidden();
  await expect
    .poll(async () => {
      const selected = await page.evaluate("window.getSelection().toString()");

      return selected;
    })
    .toBe("");
});

test("in a group's view, a selection of lines stays while another file's diff changes, and acts on its lines", async ({
  app,
  page,
  repository,
}) => {
  changeTwo(repository);

  await app.openPanel();
  await button(page, "MODIFIED FILES (2)").click();
  await selectLines(page, "bravo", "charlie");

  await expect(button(page, "Stage Lines")).toBeVisible();

  writeFile(repository, "b.txt", "b\nchanged b again\n");

  await expect(line(page, "changed b again")).toBeVisible();
  await expect(button(page, "Stage Lines")).toBeVisible();
  await expect
    .poll(async () => {
      const selected = await page.evaluate("window.getSelection().toString()");

      return selected;
    })
    .toBe("bravo\ncharlie");

  await button(page, "Stage Lines").click();

  await expect
    .poll(() => runGit(repository, ["diff", "--cached", "--", "a.txt"]))
    .toContain("+bravo\n+charlie\n");
  expect(runGit(repository, ["diff", "--cached", "--", "a.txt"])).not.toContain("+alpha");
});

test("staging selected lines stages only them", async ({ app, page, repository }) => {
  addThree(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectLines(page, "bravo", "charlie");
  await button(page, "Stage Lines").click();

  await expect(page.getByRole("heading", { name: "STAGED FILES (1)" })).toBeVisible();
  expect(staged(repository)).toContain("+bravo\n+charlie\n");
  expect(staged(repository)).not.toContain("+alpha");
});

test("unstaging selected lines unstages only them", async ({ app, page, repository }) => {
  addThree(repository);
  runGit(repository, ["add", "a.txt"]);

  await app.openPanel();
  await openFile(page, "STAGED FILES (1)", "a.txt");
  await selectLines(page, "alpha");
  await button(page, "Unstage Lines").click();

  await expect(line(page, "alpha")).toBeHidden();
  expect(staged(repository)).toContain("+bravo\n+charlie\n");
  expect(staged(repository)).not.toContain("+alpha");
});

test('discarding selected lines asks "Confirm discard?" first, then discards only them', async ({
  app,
  page,
  repository,
}) => {
  addThree(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectLines(page, "bravo");
  await button(page, "Discard Lines").click();
  await button(page, "Confirm discard?").click();

  await expect(line(page, "bravo")).toBeHidden();
  expect(worktreeFile(repository, "a.txt")?.toString()).toBe("kept\nalpha\ncharlie\n");
});

test("an untracked file's selected lines can be staged", async ({ app, page, repository }) => {
  writeFile(repository, "a.txt", "alpha\nbravo\ncharlie\n");

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", "a.txt");
  await selectLines(page, "bravo");
  await button(page, "Stage Lines").click();

  await expect(page.getByRole("heading", { name: "STAGED FILES (1)" })).toBeVisible();
  expect(staged(repository)).toMatch(/^\+bravo$/mu);
});

test('discarding selected lines of an untracked file asks "Confirm discard?" first, then discards only them, and leaves it untracked', async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "alpha\nbravo\ncharlie\n");

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", "a.txt");
  await selectLines(page, "bravo");
  await button(page, "Discard Lines").click();
  await button(page, "Confirm discard?").click();

  await expect(line(page, "bravo")).toBeHidden();
  expect(worktreeFile(repository, "a.txt")?.toString()).toBe("alpha\ncharlie\n");
  expect(runGit(repository, ["status", "--porcelain"])).toBe("?? a.txt\n");
});

test("a selection stays within the hunk it starts in", async ({ app, page, repository }) => {
  writeFile(repository, "a.txt", "1\n2\n3\n4\n5\n6\n7\n8\n9\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "first\n2\n3\n4\n5\n6\n7\n8\nlast\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectLines(page, "first", "last");

  await expect(button(page, "Stage Lines")).toHaveCount(1);

  await button(page, "Stage Lines").click();

  await expect(page.getByRole("heading", { name: "STAGED FILES (1)" })).toBeVisible();
  expect(staged(repository)).toContain("+first");
  expect(staged(repository)).not.toContain("+last");
});

test("triple-clicking a line selects only it", async ({ app, page, repository }) => {
  addThree(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await line(page, "alpha").click({ clickCount: 3 });
  await button(page, "Stage Lines").click();

  await expect(page.getByRole("heading", { name: "STAGED FILES (1)" })).toBeVisible();
  expect(staged(repository)).toContain("+alpha\n");
  expect(staged(repository)).not.toContain("+bravo");
});

test("a selection ending at the start of a line leaves that line out", async ({
  app,
  page,
  repository,
}) => {
  addThree(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectUpTo(page, "alpha", "charlie");
  await button(page, "Stage Lines").click();

  await expect(page.getByRole("heading", { name: "STAGED FILES (1)" })).toBeVisible();
  expect(staged(repository)).toContain("+alpha\n+bravo\n");
  expect(staged(repository)).not.toContain("+charlie");
});
