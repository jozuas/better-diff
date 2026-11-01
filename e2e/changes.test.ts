import type { Page } from "@playwright/test";
import { z } from "zod";

import { commitTenLines, move, tenLines } from "../test/renames";
import { commitAll, deleteFile, runGit, writeFile, writeSymlink } from "../test/repository";
import { expect, test } from "./fixtures";
import { box, dragBy, dragFrom, group, line, openFile } from "./panel";

test("changed files are grouped as modified, untracked and staged files, with how many each has", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "modified.txt", "a\n");
  writeFile(repository, "staged.txt", "a\n");
  commitAll(repository);
  writeFile(repository, "modified.txt", "b\n");
  writeFile(repository, "staged.txt", "b\n");
  runGit(repository, ["add", "staged.txt"]);
  writeFile(repository, "untracked.txt", "a\n");
  writeFile(repository, "dir/untracked.txt", "a\n");

  await app.openPanel();

  await expect(group(page, "MODIFIED FILES (1)")).toHaveText(["modified.txt"]);
  await expect(group(page, "UNTRACKED FILES (2)")).toHaveText([
    "dir/untracked.txt",
    "untracked.txt",
  ]);
  await expect(group(page, "STAGED FILES (1)")).toHaveText(["staged.txt"]);
});

test("a file's diff is under a bar with its status and full path", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "dir/sub/new file.txt", "new line\n");

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", "dir/sub/new file.txt");

  await expect(page.getByRole("heading", { name: "UNTRACKED dir/sub/new file.txt" })).toBeVisible();
  await expect(line(page, "new line")).toBeVisible();
});

test("a partly staged file is in modified and staged files, and shows the unstaged part from one and the staged part from the other", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "one\ntwo\nthree\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "one\nstaged\nthree\n");
  runGit(repository, ["add", "a.txt"]);
  writeFile(repository, "a.txt", "one\nstaged\nthree\nunstaged\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(line(page, "unstaged")).toBeVisible();
  await expect(line(page, "two")).toBeHidden();

  await openFile(page, "STAGED FILES (1)", "a.txt");

  await expect(page.getByRole("heading", { name: "STAGED a.txt" })).toBeVisible();
  await expect(line(page, "two")).toBeVisible();
  await expect(line(page, "unstaged")).toBeHidden();
});

test('with no changes and no file open, the view says "No changes"', async ({
  app,
  page,
  repository,
}) => {
  await app.openPanel();

  await expect(page.getByText("No changes", { exact: true })).toBeVisible();

  writeFile(repository, "new.txt", "a\n");
  await app.focus();

  await expect(page.getByText("Select a file to see its changes.", { exact: true })).toBeVisible();
  await expect(page.getByText("No changes", { exact: true })).toBeHidden();
});

test("changes made while the window was in the background show once it regains focus", async ({
  app,
  page,
  repository,
}) => {
  await app.openPanel();

  await expect(page.getByRole("heading", { name: "UNTRACKED FILES (0)" })).toBeVisible();

  writeFile(repository, "new.txt", "a\n");
  await app.focus();

  await expect(group(page, "UNTRACKED FILES (1)")).toHaveText(["new.txt"]);
});

test('a file with no changes shows "No changes"', async ({ app, page, repository }) => {
  writeFile(repository, "a.txt", "one\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "two\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(line(page, "two")).toBeVisible();

  runGit(repository, ["add", "a.txt"]);
  await app.focus();

  await expect(page.getByText("No changes", { exact: true })).toBeVisible();
});

test('a binary file shows "Binary file" instead of its diff', async ({ app, page, repository }) => {
  writeFile(repository, "a.bin", Buffer.from([0, 1, 2]));

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", "a.bin");

  await expect(page.getByText("Binary file", { exact: true })).toBeVisible();
});

test('a symlink shows "Symlink" instead of its diff', async ({ app, page, repository }) => {
  writeSymlink(repository, "link", "target");

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", "link");

  await expect(page.getByText("Symlink", { exact: true })).toBeVisible();
});

test("a renamed file's bar shows the path it was renamed from, and its diff its other changes", async ({
  app,
  page,
  repository,
}) => {
  commitTenLines(repository);
  runGit(repository, ["mv", "a", "b"]);
  writeFile(repository, "b", tenLines.replace("10\n", "changed\n"));
  runGit(repository, ["add", "b"]);

  await app.openPanel();
  await openFile(page, "STAGED FILES (1)", "b");

  await expect(page.getByRole("heading", { name: "STAGED a → b" })).toBeVisible();
  await expect(line(page, "changed")).toBeVisible();
});

test('a renamed file with no other changes shows "Renamed"', async ({ app, page, repository }) => {
  commitTenLines(repository);
  runGit(repository, ["mv", "a", "b"]);

  await app.openPanel();
  await openFile(page, "STAGED FILES (1)", "b");

  await expect(page.getByRole("heading", { name: "STAGED a → b" })).toBeVisible();
  await expect(page.getByText("Renamed", { exact: true })).toBeVisible();
});

test("a file moved without git is a renamed file in modified files", async ({
  app,
  page,
  repository,
}) => {
  commitTenLines(repository);
  move(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "b");

  await expect(page.getByRole("heading", { name: "UNTRACKED FILES (0)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "MODIFIED a → b" })).toBeVisible();
  await expect(page.getByText("Renamed", { exact: true })).toBeVisible();
});

test("a file added with --intent-to-add is in modified files", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "intended\n");
  runGit(repository, ["add", "--intent-to-add", "a.txt"]);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(page.getByRole("heading", { name: "UNTRACKED FILES (0)" })).toBeVisible();
  await expect(line(page, "intended")).toBeVisible();
});

test("a deleted file shows its whole old file as removed lines", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "first\nsecond\n");
  commitAll(repository);
  deleteFile(repository, "a.txt");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(line(page, "first")).toBeVisible();
  await expect(line(page, "second")).toBeVisible();
});

test("dragging the separator between the file list and the diff resizes the file list, which keeps its width in the tab", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", "a.txt");

  const separator = page.getByRole("slider", { name: "File list width" });
  const fileBar = page.getByRole("heading", { name: "UNTRACKED a.txt" });
  const before = await box(fileBar);

  await dragBy(page, separator, 100);

  await expect(separator).toHaveAttribute("aria-valuenow", "380");

  const after = await box(fileBar);

  expect(after.x).toBe(before.x + 100);
  expect(await page.evaluate("window.getSelection().toString()")).toBe("");

  await page.reload();

  await expect(separator).toHaveAttribute("aria-valuenow", "380");
});

test("the file list is no narrower than 160, and leaves the diff no narrower than 240", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", "a.txt");

  const separator = page.getByRole("slider", { name: "File list width" });

  await dragBy(page, separator, -1000);

  await expect(separator).toHaveAttribute("aria-valuenow", "160");

  await dragBy(page, separator, 5000);

  await expect
    .poll(async () => {
      const fileBar = await box(page.getByRole("heading", { name: "UNTRACKED a.txt" }));

      return fileBar.width;
    })
    .toBe(240);
});

test("the separator can be grabbed a few pixels either side of its line", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");

  await app.openPanel();

  const separator = page.getByRole("slider", { name: "File list width" });
  const { x, y, width, height } = await box(separator);
  const middle = x + width / 2;

  await dragFrom(page, middle - 5, y + height / 2, 50);

  await expect(separator).toHaveAttribute("aria-valuenow", "330");

  await dragFrom(page, middle + 50 + 5, y + height / 2, 50);

  await expect(separator).toHaveAttribute("aria-valuenow", "380");
});

// Whether the file list cuts the path short, to fit the row it's in.
async function cutShort(page: Page, path: string): Promise<boolean> {
  const text = JSON.stringify(`[aria-label="${path}"] > div`);

  const cut = await page.evaluate(
    `(() => { const text = document.querySelector(${text}); return text.scrollWidth > text.clientWidth; })()`,
  );

  return z.boolean().parse(cut);
}

test("double-clicking the separator fits the file list to its longest path", async ({
  app,
  page,
  repository,
}) => {
  const path = "some/rather/deeply/nested/directory/with-a-long-file-name.txt";

  writeFile(repository, path, "a\n");

  await app.openPanel();

  const separator = page.getByRole("slider", { name: "File list width" });

  await expect(group(page, "UNTRACKED FILES (1)")).toHaveText([path]);
  expect(await cutShort(page, path)).toBe(true);

  await separator.dblclick();

  await expect
    .poll(async () => {
      const cut = await cutShort(page, path);

      return cut;
    })
    .toBe(false);
  await expect(separator).not.toHaveAttribute("aria-valuenow", "280");
});

test("double-clicking the separator narrows the file list to fit, down to 160", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a", "a\n");

  await app.openPanel();
  await expect(group(page, "UNTRACKED FILES (1)")).toHaveText(["a"]);
  await page.getByRole("slider", { name: "File list width" }).dblclick();

  await expect(page.getByRole("slider", { name: "File list width" })).toHaveAttribute(
    "aria-valuenow",
    "160",
  );
});
