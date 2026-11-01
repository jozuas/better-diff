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
