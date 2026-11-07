import { commitAll, runGit, worktreeFile, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { button, line, openFile } from "./panel";
import {
  changeA,
  comment,
  messageBox,
  openReview,
  pending,
  prompt,
  review,
  sendButton,
} from "./review";

test("sending the review sends the pending comments to the workspace's agent, as Paseo's own diff sends them, and they're pending no longer", async ({
  agents,
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "BRAVO", "Why uppercase?");
  await comment(page, "bravo", "Was fine");

  const reviewer = await agents.start("Reviewer");
  const opened = await openReview(page, 2);

  await expect(opened.getByRole("button", { name: "Agent: Reviewer", exact: true })).toBeVisible();

  await sendButton(opened).click();

  await expect(page.getByText("Feedback sent to Reviewer.", { exact: true })).toBeVisible();
  await expect(review(page)).toBeHidden();
  await expect(page.getByRole("group", { name: "Pending review comment" })).toHaveCount(0);
  await expect(button(page, "Review (2)")).toBeHidden();

  const context = {
    hunkHeader: "@@ -1,4 +1,5 @@",
    lines: [
      { oldLineNumber: 1, newLineNumber: 1, type: "context", content: "kept" },
      { oldLineNumber: 2, newLineNumber: 2, type: "context", content: "alpha" },
      { oldLineNumber: 3, newLineNumber: null, type: "remove", content: "bravo" },
      { oldLineNumber: null, newLineNumber: 3, type: "add", content: "BRAVO" },
      { oldLineNumber: 4, newLineNumber: 4, type: "context", content: "charlie" },
      { oldLineNumber: null, newLineNumber: 5, type: "add", content: "delta" },
    ],
  };

  await expect.poll(reviewer.sent).toStrictEqual([
    [
      prompt,
      {
        type: "review",
        mimeType: "application/paseo-review",
        cwd: expect.stringContaining("better-diff-"),
        mode: "uncommitted",
        baseRef: null,
        comments: [
          {
            filePath: "a.txt",
            side: "new",
            lineNumber: 3,
            body: "Why uppercase?",
            context: { ...context, targetLine: context.lines[3] },
          },
          {
            filePath: "a.txt",
            side: "old",
            lineNumber: 3,
            body: "Was fine",
            context: { ...context, targetLine: context.lines[2] },
          },
        ],
      },
    ],
  ]);
});

test("with several agents in the workspace, the review goes to the one chosen, the one active most recently at first", async ({
  agents,
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "delta", "Not needed");

  const reviewer = await agents.start("Reviewer");
  const second = await agents.start("Second");
  const opened = await openReview(page, 1);

  await opened.getByRole("button", { name: "Agent: Second", exact: true }).click();

  const menu = page.getByRole("menu", { name: "Choose an agent" });

  await expect(menu.getByRole("menuitem")).toHaveText(["Second", "Reviewer"]);

  await menu.getByRole("menuitem", { name: "Reviewer", exact: true }).click();
  await sendButton(opened).click();

  await expect(page.getByText("Feedback sent to Reviewer.", { exact: true })).toBeVisible();
  await expect.poll(reviewer.sent).toHaveLength(1);
  expect(second.sent()).toStrictEqual([]);
});

test("without an agent in the workspace, the review says to start one, and can't be sent", async ({
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "BRAVO", "Why uppercase?");

  const opened = await openReview(page, 1);

  await expect(
    opened.getByText("Start an agent in this workspace to send it feedback.", { exact: true }),
  ).toBeVisible();
  await expect(sendButton(opened)).toBeDisabled();
});

test("the review is sent with the message written for the agent, with Cmd or Ctrl and Enter, and the message is empty again after", async ({
  agents,
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "BRAVO", "Why uppercase?");

  const reviewer = await agents.start("Reviewer");
  const opened = await openReview(page, 1);

  await expect(opened.getByRole("button", { name: "Agent: Reviewer", exact: true })).toBeVisible();

  await messageBox(opened).fill("  Fix these,\nthen run the tests.\n");
  await messageBox(opened).press("ControlOrMeta+Enter");

  await expect(page.getByText("Feedback sent to Reviewer.", { exact: true })).toBeVisible();
  await expect
    .poll(reviewer.sent)
    .toMatchObject([[{ type: "text", text: "Fix these,\nthen run the tests." }, {}]]);

  await comment(page, "delta", "Not needed");

  await expect(messageBox(await openReview(page, 1))).toHaveValue("");
});

test("comments on lines their diffs no longer have stay pending, listed as no longer there, and aren't sent", async ({
  agents,
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "BRAVO", "Why uppercase?");
  await comment(page, "delta", "Not needed");

  const reviewer = await agents.start("Reviewer");

  writeFile(repository, "a.txt", "kept\nalpha\nBRAVO\ncharlie\n");

  await expect(line(page, "delta")).toBeHidden();

  const opened = await openReview(page, 2);

  await expect(pending(opened, "Not needed")).toContainText("No longer in its diff");
  await expect(opened.getByRole("button", { name: "Show line 5 of a.txt" })).toBeDisabled();

  await sendButton(opened).click();

  await expect(
    page.getByText(
      "Feedback sent to Reviewer. 1 comment wasn't, as its line is no longer in its diff.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(pending(opened, "Not needed")).toBeVisible();
  await expect(pending(opened, "Why uppercase?")).toBeHidden();
  await expect
    .poll(reviewer.sent)
    .toMatchObject([[prompt, { comments: [{ body: "Why uppercase?" }] }]]);

  await sendButton(opened).click();

  await expect(
    page.getByText("Nothing was sent. 1 comment wasn't, as its line is no longer in its diff.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(reviewer.sent()).toHaveLength(1);
});

test("the review is sent once at a time: while it's sent, Send feedback is disabled, and Cmd+Enter does nothing, though the review is closed and opened again, and a message changed meanwhile stays", async ({
  agents,
  app,
  page,
  repository,
}) => {
  changeA(repository);

  const sends = await app.holdSends();

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "BRAVO", "Why uppercase?");

  const reviewer = await agents.start("Reviewer");
  const opened = await openReview(page, 1);

  await expect(opened.getByRole("button", { name: "Agent: Reviewer", exact: true })).toBeVisible();

  await messageBox(opened).fill("Fix this.");
  await messageBox(opened).press("ControlOrMeta+Enter");

  await expect.poll(sends.held).toBe(1);

  await messageBox(opened).press("ControlOrMeta+Enter");
  await messageBox(opened).fill("Fix this, and test it.");
  await page.keyboard.press("Escape");

  const reopened = await openReview(page, 1);

  await expect(
    reopened.getByRole("button", { name: "Sending feedback", exact: true }),
  ).toBeDisabled();

  sends.release();

  await expect(page.getByText("Feedback sent to Reviewer.", { exact: true })).toBeVisible();
  await expect
    .poll(reviewer.sent)
    .toMatchObject([
      [{ type: "text", text: "Fix this." }, { comments: [{ body: "Why uppercase?" }] }],
    ]);
  expect(sends.held()).toBe(1);

  await comment(page, "delta", "Not needed");

  await expect(messageBox(await openReview(page, 1))).toHaveValue("Fix this, and test it.");
});

test("comments on a partly staged file are sent with their lines' numbers in HEAD and the worktree, as Paseo's own diff numbers them", async ({
  agents,
  app,
  page,
  repository,
}) => {
  const head = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

  writeFile(repository, "a.txt", `${head.join("\n")}\n`);
  commitAll(repository);
  writeFile(repository, "a.txt", `zero\n${head.join("\n")}\n`);
  runGit(repository, ["add", "a.txt"]);
  writeFile(repository, "a.txt", `minus\nzero\n${head.join("\n").replace("nine", "NINE")}\n`);

  await app.openPanel();
  await openFile(page, "STAGED FILES (1)", "a.txt");
  await comment(page, "zero", "Why zero?");
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "nine", "Keep nine");

  const reviewer = await agents.start("Reviewer");
  const opened = await openReview(page, 2);

  await expect(opened.getByRole("button", { name: "Agent: Reviewer", exact: true })).toBeVisible();

  await sendButton(opened).click();

  await expect(page.getByText("Feedback sent to Reviewer.", { exact: true })).toBeVisible();
  await expect.poll(reviewer.sent).toMatchObject([
    [
      prompt,
      {
        comments: [
          {
            side: "new",
            lineNumber: 2,
            body: "Why zero?",
            context: { hunkHeader: "@@ -1,3 +2,4 @@", targetLine: { content: "zero" } },
          },
          {
            side: "old",
            lineNumber: 9,
            body: "Keep nine",
            context: { hunkHeader: "@@ -6,5 +8,5 @@", targetLine: { content: "nine" } },
          },
        ],
      },
    ],
  ]);
  expect(runGit(repository, ["show", "HEAD:a.txt"]).split("\n")[8]).toBe("nine");
  expect(worktreeFile(repository, "a.txt")?.toString().split("\n")[1]).toBe("zero");
});

test("a comment on a line staged and then changed in the worktree stays pending, listed as changed since it was staged, and isn't sent", async ({
  agents,
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
  await comment(page, "TWO", "Why uppercase?");

  const reviewer = await agents.start("Reviewer");
  const opened = await openReview(page, 1);

  await expect(opened.getByRole("button", { name: "Agent: Reviewer", exact: true })).toBeVisible();
  await expect(pending(opened, "Why uppercase?")).toContainText("Changed since it was staged");

  await sendButton(opened).click();

  await expect(
    page.getByText(
      "Nothing was sent. 1 comment wasn't, as its line has changed since it was staged.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(pending(opened, "Why uppercase?")).toBeVisible();
  expect(reviewer.sent()).toStrictEqual([]);
});
