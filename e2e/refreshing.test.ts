import { join } from "node:path";

import { inDirectory, makeUnreadable, runGit, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { group, line, openFile } from "./panel";

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
