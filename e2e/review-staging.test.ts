import { commitAll, runGit, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { button, line, openFile, row } from "./panel";
import { comment, expectBetween, openReview, prompt, sendTo } from "./review";

test("a comment stays on its line as its file's hunks are staged, and shows under it in whichever of the file's diffs has it", async ({
  agents,
  app,
  page,
  repository,
}) => {
  const head = Array.from({ length: 40 }, (_, at) => `line ${String(at + 1)}`);
  const index = [...head.slice(0, 2), "new 1", "new 2", "new 3", ...head.slice(2)];
  const worktree = index.with(index.indexOf("line 33"), "LINE 33");

  writeFile(repository, "a.txt", `${head.join("\n")}\n`);
  commitAll(repository);
  writeFile(repository, "a.txt", `${worktree.join("\n")}\n`);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "line 33", "Keep it lowercase");

  // Staging the lines added above it numbers the line three lines on in the index.
  writeFile(repository, "a.txt", `${index.join("\n")}\n`);
  runGit(repository, ["add", "a.txt"]);
  writeFile(repository, "a.txt", `${worktree.join("\n")}\n`);

  await expect(row(page, "STAGED FILES (1)", "a.txt")).toBeVisible();
  await expect(line(page, "new 1")).toBeHidden();
  await expectBetween(page, "Keep it lowercase", "line 33", "LINE 33");

  runGit(repository, ["add", "a.txt"]);

  await expect(line(page, "MODIFIED FILES (0)")).toBeVisible();

  await openFile(page, "STAGED FILES (1)", "a.txt");
  await expectBetween(page, "Keep it lowercase", "line 33", "LINE 33");

  const reviewer = await agents.start("Reviewer");

  await sendTo(page, await openReview(page, 1), "Reviewer");

  await expect.poll(reviewer.sent).toMatchObject([
    [
      prompt,
      {
        comments: [
          {
            side: "old",
            lineNumber: 33,
            body: "Keep it lowercase",
            context: { targetLine: { type: "remove", content: "line 33" } },
          },
        ],
      },
    ],
  ]);
  expect(runGit(repository, ["show", "HEAD:a.txt"]).split("\n")[32]).toBe("line 33");
});

test("a line only the index has, staged and then changed in the worktree, can't be commented on", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "one\ntwo\nthree\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "one\nTWO\nthree\n");
  runGit(repository, ["add", "a.txt"]);
  writeFile(repository, "a.txt", "one\nTwo\nthree\n");

  await app.openPanel();
  await openFile(page, "STAGED FILES (1)", "a.txt");
  await line(page, "two").hover();

  await expect(button(page, "Add review comment")).toBeVisible();

  await line(page, "TWO").hover();

  await expect(button(page, "Add review comment")).toBeHidden();
  expect(runGit(repository, ["show", ":a.txt"])).toBe("one\nTWO\nthree\n");
});
