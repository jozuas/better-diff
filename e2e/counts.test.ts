import { commitAll, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { openFile } from "./panel";

test("a file's bar shows how many lines its diff adds and removes after its path, even while it's collapsed, and a binary or an empty file's none", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "one\ntwo\n");
  writeFile(repository, "yarn.lock", "a\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "one\n2\nthree\n");
  writeFile(repository, "yarn.lock", Array.from({ length: 1234 }, () => "b\n").join(""));
  writeFile(repository, "b.bin", "\0");
  writeFile(repository, "c.txt", "");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");

  await expect(page.getByRole("heading", { name: "MODIFIED a.txt +2 −1" })).toBeVisible();

  await openFile(page, "MODIFIED FILES (2)", "yarn.lock");

  await expect(page.getByText("Generated file", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "MODIFIED yarn.lock +1,234 −1" })).toBeVisible();

  await openFile(page, "UNTRACKED FILES (2)", "b.bin");

  await expect(page.getByText("Binary file", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "UNTRACKED b.bin" })).not.toContainText("−");

  await openFile(page, "UNTRACKED FILES (2)", "c.txt");

  await expect(page.getByText("Empty file", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "UNTRACKED c.txt" })).not.toContainText("−");
});
