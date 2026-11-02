import {
  commitAll,
  indexFile,
  indexMode,
  makeExecutable,
  runGit,
  worktreeMode,
  writeFile,
} from "../test/repository";
import { expect, test } from "./fixtures";
import { button, line, openFile } from "./panel";

// Commits `run.sh` as one line, then changes its line and makes it executable.
function changeAndMakeExecutable(repository: string): void {
  writeFile(repository, "run.sh", "echo a\n");
  commitAll(repository);
  writeFile(repository, "run.sh", "echo b\n");
  makeExecutable(repository, "run.sh");
}

const modeBar = "File mode 100644 → 100755";

test("a mode change shows its old and new mode above the hunks, and staging it stages only the mode change", async ({
  app,
  page,
  repository,
}) => {
  changeAndMakeExecutable(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "run.sh");
  await expect(page.getByText(modeBar, { exact: true })).toBeVisible();
  await expect(line(page, "echo b")).toBeVisible();

  await button(page, "Stage Mode Change").click();

  await expect(page.getByText(modeBar, { exact: true })).toHaveCount(0);
  await expect(line(page, "echo b")).toBeVisible();
  expect(runGit(repository, ["diff", "--cached"])).toBe(
    "diff --git a/run.sh b/run.sh\nold mode 100644\nnew mode 100755\n",
  );
});

test("hunk actions leave a mode change alone, and file actions include it", async ({
  app,
  page,
  repository,
}) => {
  changeAndMakeExecutable(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "run.sh");
  await button(page, "Stage Hunk").click();

  await expect(page.getByRole("heading", { name: "STAGED FILES (1)" })).toBeVisible();
  await expect(page.getByText(modeBar, { exact: true })).toBeVisible();
  await expect(line(page, "echo b")).toHaveCount(0);
  expect(indexFile(repository, "run.sh")?.toString()).toBe("echo b\n");
  expect(indexMode(repository, "run.sh")).toBe("100644");

  await button(page, "Stage").click();

  await expect(page.getByRole("heading", { name: "MODIFIED FILES (0)" })).toBeVisible();
  expect(indexMode(repository, "run.sh")).toBe("100755");
});

test("unstaging a mode change unstages only the mode change", async ({ app, page, repository }) => {
  changeAndMakeExecutable(repository);
  runGit(repository, ["add", "run.sh"]);

  await app.openPanel();
  await openFile(page, "STAGED FILES (1)", "run.sh");
  await expect(button(page, "Discard Mode Change")).toHaveCount(0);
  await button(page, "Unstage Mode Change").click();

  await expect(page.getByText(modeBar, { exact: true })).toHaveCount(0);
  await expect(line(page, "echo b")).toBeVisible();
  expect(indexFile(repository, "run.sh")?.toString()).toBe("echo b\n");
  expect(indexMode(repository, "run.sh")).toBe("100644");
});

test('discarding a mode change asks "Confirm discard?" first, then restores the mode', async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "run.sh", "echo a\n");
  commitAll(repository);
  makeExecutable(repository, "run.sh");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "run.sh");
  await button(page, "Discard Mode Change").click();
  await expect(button(page, "Confirm discard?")).toBeVisible();

  expect(worktreeMode(repository, "run.sh")).toBe("100755");

  await button(page, "Confirm discard?").click();

  await expect(page.getByRole("heading", { name: "MODIFIED FILES (0)" })).toBeVisible();
  expect(worktreeMode(repository, "run.sh")).toBe("100644");
});
