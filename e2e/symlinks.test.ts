import { lstatSync } from "node:fs";
import { join } from "node:path";

import { commitAll, linkDirectory, runGit, worktreeFile, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { button, line, openFile, selectLines } from "./panel";

// Commits `a/b.txt`, and puts a symlink in place of its directory, to one that has a `b.txt` of its
// own. git takes `a/b.txt` for deleted, as it never looks beyond a symlink.
function linkItsDirectory(repository: string): void {
  writeFile(repository, "a/b.txt", "alpha\nbravo\n");
  commitAll(repository);
  writeFile(repository, ".git/outside/b.txt", "outside\n");
  linkDirectory(repository, "a", ".git/outside");
}

test("discarding lines of a file in a directory that's become a symlink changes nothing, and says why", async ({
  app,
  page,
  repository,
}) => {
  linkItsDirectory(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a/b.txt");
  await selectLines(page, "bravo");
  await button(page, "Discard Lines").click();
  await button(page, "Confirm discard?").click();

  await expect(
    page.getByText(
      "A directory this file is in is now a symlink, and git won't write a file beyond one, so nothing was done. Discarding the whole file puts the directory back in place of the symlink.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(runGit(repository, ["status", "--porcelain", "--untracked-files=all"])).toBe(
    " D a/b.txt\n?? a\n",
  );
  expect(worktreeFile(repository, ".git/outside/b.txt")?.toString()).toBe("outside\n");
});

test("discarding a file in a directory that's become a symlink puts the directory back in place of the symlink", async ({
  app,
  page,
  repository,
}) => {
  linkItsDirectory(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a/b.txt");
  await expect(line(page, "bravo")).toBeVisible();
  await button(page, "Discard").click();
  await button(page, "Confirm discard?").click();

  await expect(page.getByRole("heading", { name: "MODIFIED FILES (0)" })).toBeVisible();
  expect(runGit(repository, ["status", "--porcelain", "--untracked-files=all"])).toBe("");
  expect(lstatSync(join(repository, "a")).isDirectory()).toBe(true);
  expect(worktreeFile(repository, ".git/outside/b.txt")?.toString()).toBe("outside\n");
});
