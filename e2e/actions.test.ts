import { commitAll, runGit, worktreeFile, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { button, group, line, openFile } from "./panel";

function staged(repository: string): string {
  return runGit(repository, ["diff", "--cached"]);
}

function numbered(name: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${name} ${index + 1}`);
}

// Commits `a.txt` as lines 1 to 9, then changes its first and last line, which makes two hunks.
function changeTwoHunks(repository: string): void {
  writeFile(repository, "a.txt", "1\n2\n3\n4\n5\n6\n7\n8\n9\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "first\n2\n3\n4\n5\n6\n7\n8\nlast\n");
}

test("staging a file stages all its changes, and the view moves to the next file", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");
  writeFile(repository, "b.txt", "b\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "staged\n");
  writeFile(repository, "b.txt", "next\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");
  await button(page, "Stage").click();

  await expect(page.getByRole("heading", { name: "MODIFIED b.txt" })).toBeVisible();
  await expect(line(page, "next")).toBeVisible();
  expect(runGit(repository, ["diff", "--cached", "--name-only"])).toBe("a.txt\n");
});

test("unstaging a file unstages all its changes, which can't be discarded", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);
  runGit(repository, ["add", "a.txt"]);

  await app.openPanel();
  await openFile(page, "STAGED FILES (1)", "a.txt");

  await expect(button(page, "Unstage Hunk")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Discard|Delete/u })).toHaveCount(0);

  await button(page, "Unstage").click();

  await expect(page.getByRole("heading", { name: "STAGED FILES (0)" })).toBeVisible();
  expect(staged(repository)).toBe("");
});

test('discarding a file asks "Confirm discard?" first, then restores it', async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await button(page, "Discard").click();
  await expect(button(page, "Confirm discard?")).toBeVisible();

  expect(worktreeFile(repository, "a.txt")?.toString()).toContain("first");

  await button(page, "Confirm discard?").click();

  await expect(page.getByRole("heading", { name: "MODIFIED FILES (0)" })).toBeVisible();
  expect(worktreeFile(repository, "a.txt")?.toString()).toBe("1\n2\n3\n4\n5\n6\n7\n8\n9\n");
});

test('deleting an untracked file asks "Confirm delete?" first, then deletes it', async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", "a.txt");
  await button(page, "Delete").click();
  await expect(button(page, "Confirm delete?")).toBeVisible();

  expect(worktreeFile(repository, "a.txt")).toBeDefined();

  await button(page, "Confirm delete?").click();

  await expect(page.getByRole("heading", { name: "UNTRACKED FILES (0)" })).toBeVisible();
  expect(worktreeFile(repository, "a.txt")).toBeUndefined();
});

test("a confirmation lapses after about three seconds, having changed nothing", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await button(page, "Discard Hunk").first().click();
  await expect(button(page, "Confirm discard?")).toBeVisible();
  await expect(button(page, "Discard Hunk")).toHaveCount(2, { timeout: 5000 });

  expect(worktreeFile(repository, "a.txt")?.toString()).toContain("first");
});

test("staging a hunk stages only it, and the view moves to the next hunk", async ({
  app,
  page,
  repository,
}) => {
  // Four hunks, the first two taller than the view, and the last tall enough to leave the view
  // where it is.
  const lines = numbered("line", 200);

  writeFile(repository, "a.txt", `${lines.join("\n")}\n`);
  commitAll(repository);
  writeFile(
    repository,
    "a.txt",
    `${[
      ...lines.slice(0, 10),
      ...numbered("first", 40),
      ...lines.slice(10, 60),
      ...numbered("second", 40),
      ...lines.slice(60, 109),
      "third",
      ...lines.slice(110, 160),
      ...numbered("fourth", 40),
      ...lines.slice(160),
    ].join("\n")}\n`,
  );

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  const stageHunk = button(page, "Stage Hunk");

  await stageHunk.nth(1).scrollIntoViewIfNeeded();

  const before = await stageHunk.nth(1).boundingBox();

  await stageHunk.nth(1).click();
  await expect(line(page, "second 1")).toBeHidden();
  await expect(line(page, "third")).toBeInViewport();

  const after = await stageHunk.nth(1).boundingBox();

  expect(after?.y).toBe(before?.y);
  expect(staged(repository)).toContain("+second 40\n");
  expect(staged(repository)).not.toMatch(/^\+(?:first|third|fourth)/mu);
});

test("unstaging a hunk unstages only it", async ({ app, page, repository }) => {
  changeTwoHunks(repository);
  runGit(repository, ["add", "a.txt"]);

  await app.openPanel();
  await openFile(page, "STAGED FILES (1)", "a.txt");
  await button(page, "Unstage Hunk").first().click();

  await expect(line(page, "first")).toBeHidden();
  expect(staged(repository)).not.toContain("first");
  expect(staged(repository)).toContain("+last");
});

test('discarding a hunk asks "Confirm discard?" first, then discards only it', async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await button(page, "Discard Hunk").first().click();
  await button(page, "Confirm discard?").click();

  await expect(line(page, "first")).toBeHidden();
  await expect(line(page, "last")).toBeVisible();
  expect(worktreeFile(repository, "a.txt")?.toString()).toBe("1\n2\n3\n4\n5\n6\n7\n8\nlast\n");
});

test("an untracked file's hunk can be staged, but not discarded", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", "a.txt");

  await expect(button(page, "Discard Hunk")).toHaveCount(0);

  await button(page, "Stage Hunk").click();

  await expect(group(page, "STAGED FILES (1)")).toHaveText(["a.txt"]);
  expect(runGit(repository, ["diff", "--cached", "--name-only"])).toBe("a.txt\n");
});

test("an action on a diff that changed since it was shown changes nothing, and reloads the diff saying so", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await expect(line(page, "first")).toBeVisible();

  writeFile(repository, "a.txt", "changed\n2\n3\n4\n5\n6\n7\n8\n9\n");
  await button(page, "Stage").click();

  await expect(
    page.getByText(/^The diff changed after it was shown, so nothing was done\./u),
  ).toBeVisible();
  await expect(line(page, "changed")).toBeVisible();
  expect(staged(repository)).toBe("");
});
