import { commitAll, runGit, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { button, line, openFile } from "./panel";

test('a generated file is collapsed to "Generated file" until "Show diff" shows its diff', async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "package-lock.json", "{}\n");
  commitAll(repository);
  writeFile(repository, "package-lock.json", "{ locked }\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "package-lock.json");

  await expect(page.getByText("Generated file", { exact: true })).toBeVisible();
  await expect(line(page, "{ locked }")).toHaveCount(0);

  await button(page, "Show diff").click();

  await expect(line(page, "{ locked }")).toBeVisible();
  await expect(page.getByText("Generated file", { exact: true })).toHaveCount(0);
});

test('a diff of more than 1,000 changed lines is collapsed to "Large diff" until "Show diff" shows it', async ({
  app,
  page,
  repository,
}) => {
  writeFile(
    repository,
    "a.txt",
    Array.from({ length: 1001 }, (_, index) => `line ${index + 1}\n`).join(""),
  );

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", "a.txt");

  await expect(page.getByText("Large diff", { exact: true })).toBeVisible();
  await expect(line(page, "line 1")).toHaveCount(0);

  await button(page, "Show diff").click();

  await expect(line(page, "line 1")).toBeVisible();
});

test("a collapsed file's actions work while it's collapsed", async ({ app, page, repository }) => {
  writeFile(repository, "a.txt", "a\n");
  writeFile(repository, "yarn.lock", "a\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "b\n");
  writeFile(repository, "yarn.lock", "b\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "yarn.lock");
  await expect(page.getByText("Generated file", { exact: true })).toBeVisible();
  await button(page, "Stage").click();

  await expect(page.getByRole("heading", { name: "MODIFIED a.txt" })).toBeVisible();
  expect(runGit(repository, ["diff", "--cached", "--name-only"])).toBe("yarn.lock\n");
});
