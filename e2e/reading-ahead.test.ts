import { commitAll, runGit, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { button, line } from "./panel";

test("while a file is open, the diff of the file a file action would move the view to is read too, so it shows at once after one", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");
  writeFile(repository, "b.txt", "b\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "staged\n");
  writeFile(repository, "b.txt", "next\n");

  const answered = await app.readDiffOnce("b.txt");

  await app.openPanel();
  await expect(line(page, "staged")).toBeVisible();
  await expect.poll(answered).toBe(true);
  await button(page, "Stage").click();

  await expect(page.getByRole("heading", { name: "MODIFIED b.txt" })).toBeVisible();
  await expect(line(page, "next")).toBeVisible();
  expect(runGit(repository, ["diff", "--cached", "--name-only"])).toBe("a.txt\n");
});
