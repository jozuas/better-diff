import { commitAll, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { openFile } from "./panel";

test("a file's bar shows how many lines its diff adds and removes after its path, even while it's collapsed, and a binary file's none", async ({
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

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");

  await expect(page.getByRole("heading", { name: "MODIFIED a.txt +2 −1" })).toBeVisible();

  await openFile(page, "MODIFIED FILES (2)", "yarn.lock");

  await expect(page.getByText("Generated file", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "MODIFIED yarn.lock +1,234 −1" })).toBeVisible();

  await openFile(page, "UNTRACKED FILES (1)", "b.bin");

  await expect(page.getByText("Binary file", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "UNTRACKED b.bin" })).not.toContainText("−");
});
