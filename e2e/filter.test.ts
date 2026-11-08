import { commitAll, runGit, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { button, group, line, openFile } from "./panel";

// Two modified files, one in src, an untracked one in src, and a staged one.
function changeFour(repository: string): void {
  writeFile(repository, "src/app.ts", "a\n");
  writeFile(repository, "docs/readme.md", "a\n");
  writeFile(repository, "other.txt", "a\n");
  commitAll(repository);
  writeFile(repository, "src/app.ts", "b\n");
  writeFile(repository, "docs/readme.md", "b\n");
  writeFile(repository, "other.txt", "b\n");
  runGit(repository, ["add", "other.txt"]);
  writeFile(repository, "src/new.ts", "a\n");
}

test("typing in the filter hides the files whose path doesn't have it, whatever its case, and keeps every group", async ({
  app,
  page,
  repository,
}) => {
  changeFour(repository);

  await app.openPanel();
  await page.getByRole("textbox", { name: "Filter files" }).pressSequentially("SRC");

  await expect(group(page, "MODIFIED FILES (1 of 2)")).toHaveText(["src/app.ts"]);
  await expect(group(page, "UNTRACKED FILES (1)")).toHaveText(["src/new.ts"]);
  await expect(page.getByRole("heading", { name: "STAGED FILES (0 of 1)" })).toBeVisible();
  await expect(group(page, "STAGED FILES (0 of 1)")).toHaveCount(0);
});

test("clearing the filter with the × on its right shows every file again", async ({
  app,
  page,
  repository,
}) => {
  changeFour(repository);

  await app.openPanel();

  const filter = page.getByRole("textbox", { name: "Filter files" });

  await filter.pressSequentially("readme");
  await expect(group(page, "MODIFIED FILES (1 of 2)")).toHaveText(["docs/readme.md"]);
  await button(page, "Clear filter").click();

  await expect(filter).toHaveValue("");
  await expect(group(page, "MODIFIED FILES (2)")).toHaveText(["docs/readme.md", "src/app.ts"]);
  await expect(group(page, "STAGED FILES (1)")).toHaveText(["other.txt"]);
  await expect(button(page, "Clear filter")).toBeHidden();
});

test("deleting the filter's letters shows every file again", async ({ app, page, repository }) => {
  changeFour(repository);

  await app.openPanel();

  const filter = page.getByRole("textbox", { name: "Filter files" });

  await filter.pressSequentially("app");
  await expect(group(page, "MODIFIED FILES (1 of 2)")).toHaveText(["src/app.ts"]);
  await filter.press("Backspace");
  await filter.press("Backspace");
  await filter.press("Backspace");

  await expect(group(page, "MODIFIED FILES (2)")).toHaveText(["docs/readme.md", "src/app.ts"]);
  await expect(group(page, "UNTRACKED FILES (1)")).toHaveText(["src/new.ts"]);
});

test("once the open file leaves its group, the view moves on to the next file in it the filter shows", async ({
  app,
  page,
  repository,
}) => {
  for (const path of ["a.md", "b.txt", "c.md"]) {
    writeFile(repository, path, "one\n");
  }

  commitAll(repository);

  for (const path of ["a.md", "b.txt", "c.md"]) {
    writeFile(repository, path, `${path} two\n`);
  }

  await app.openPanel();
  await page.getByRole("textbox", { name: "Filter files" }).fill("md");
  await openFile(page, "MODIFIED FILES (2 of 3)", "a.md");
  await expect(line(page, "a.md two")).toBeVisible();
  await button(page, "Stage").click();

  await expect(page.getByRole("heading", { name: "MODIFIED c.md" })).toBeVisible();
  await expect(line(page, "c.md two")).toBeVisible();
  expect(runGit(repository, ["status", "--porcelain"])).toBe("M  a.md\n M b.txt\n M c.md\n");
});
