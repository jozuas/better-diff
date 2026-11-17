import { commitAll, runGit, worktreeFile, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { box, button, line, openFile, selectLines } from "./panel";
import {
  changeA,
  comment,
  editor,
  expectBetween,
  openReview,
  pending,
  prompt,
  review,
  sendTo,
} from "./review";

// Thirteen lines, "line 1" to "line 13", but the twelfth "TWELVE".
const changed = Array.from({ length: 13 }, (_, at) => `line ${String(at + 1)}`).with(11, "TWELVE");

// Commits `a.txt` as thirteen lines, "line 1" to "line 13", and then adds "first" before them and
// changes the twelfth to "TWELVE", in two hunks.
function changeTwoHunks(repository: string): void {
  writeFile(repository, "a.txt", `${changed.with(11, "line 12").join("\n")}\n`);
  commitAll(repository);
  writeFile(repository, "a.txt", `first\n${changed.join("\n")}\n`);
}

test("a comment follows its line as lines are removed above it, as by discarding the change above it, and is sent on it", async ({
  agents,
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "TWELVE", "Why uppercase?");
  await button(page, "Discard Hunk").first().click();
  await button(page, "Confirm discard?").click();

  await expect(line(page, "first")).toBeHidden();
  expect(worktreeFile(repository, "a.txt")?.toString()).toBe(`${changed.join("\n")}\n`);
  await expectBetween(page, "Why uppercase?", "TWELVE", "line 13");

  const reviewer = await agents.start("Reviewer");

  await sendTo(page, await openReview(page, 1), "Reviewer");

  await expect.poll(reviewer.sent).toMatchObject([
    [
      prompt,
      {
        comments: [
          {
            side: "new",
            lineNumber: 12,
            body: "Why uppercase?",
            context: { targetLine: { newLineNumber: 12, content: "TWELVE" } },
          },
        ],
      },
    ],
  ]);
});

test("a comment whose line is changed is no longer in its diffs, and isn't sent, while one below it follows its line as lines are added above it, as by an agent", async ({
  agents,
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "BRAVO", "Why uppercase?");
  await comment(page, "charlie", "Keep it");

  writeFile(repository, "a.txt", "first\nkept\nalpha\nBravo\ncharlie\ndelta\n");

  await expect(line(page, "first")).toBeVisible();
  await expectBetween(page, "Keep it", "charlie", "delta");
  await expect(pending(page, "Why uppercase?")).toBeHidden();

  const reviewer = await agents.start("Reviewer");
  const opened = await openReview(page, 2);

  await expect(pending(opened, "Why uppercase?")).toContainText("No longer in its diffs");

  await sendTo(page, opened, "Reviewer");

  await expect(
    page.getByText(
      "Feedback sent to Reviewer. 1 comment wasn't, as its line is no longer in its diffs.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect.poll(reviewer.sent).toMatchObject([
    [
      prompt,
      {
        comments: [
          {
            side: "new",
            lineNumber: 5,
            body: "Keep it",
            context: { targetLine: { newLineNumber: 5, content: "charlie" } },
          },
        ],
      },
    ],
  ]);
});

test("a comment on a removed line follows its line as HEAD's lines above it change, as by a commit", async ({
  agents,
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "bravo", "Was fine");

  writeFile(repository, "a.txt", "zero\nkept\nalpha\nbravo\ncharlie\n");
  runGit(repository, ["commit", "--quiet", "--all", "--message", "Add zero"]);
  writeFile(repository, "a.txt", "kept\nalpha\nBRAVO\ncharlie\ndelta\n");

  await expect(line(page, "zero")).toBeVisible();
  await expectBetween(page, "Was fine", "bravo", "BRAVO");

  const reviewer = await agents.start("Reviewer");

  await sendTo(page, await openReview(page, 1), "Reviewer");

  await expect.poll(reviewer.sent).toMatchObject([
    [
      prompt,
      {
        comments: [
          {
            side: "old",
            lineNumber: 4,
            body: "Was fine",
            context: { targetLine: { oldLineNumber: 4, content: "bravo" } },
          },
        ],
      },
    ],
  ]);
});

test("a comment follows its line though its file changed while Paseo was closed", async ({
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "charlie", "Keep it");

  const panel = page.url();

  await page.goto("about:blank");
  writeFile(repository, "a.txt", "first\nkept\nalpha\nBRAVO\ncharlie\ndelta\n");
  await page.goto(panel);

  await expect(line(page, "first")).toBeVisible();
  await expectBetween(page, "Keep it", "charlie", "delta");
});

test("a comment follows its line though only its whitespace changes, as when an agent indents it", async ({
  agents,
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "charlie", "Keep it");

  writeFile(repository, "a.txt", "first\nkept\nalpha\nBRAVO\n  charlie\ndelta\n");

  await expect(line(page, "first")).toBeVisible();
  await expectBetween(page, "Keep it", "BRAVO", "delta");

  const reviewer = await agents.start("Reviewer");

  await sendTo(page, await openReview(page, 1), "Reviewer");

  await expect.poll(reviewer.sent).toMatchObject([
    [
      prompt,
      {
        comments: [
          {
            side: "new",
            lineNumber: 5,
            body: "Keep it",
            context: { targetLine: { newLineNumber: 5, content: "  charlie" } },
          },
        ],
      },
    ],
  ]);
});

// Two functions, each ending its own "}".
const functions = ["function a() {", "  return 1;", "}", "function b() {", "  return 2;", "}"];

test("a comment on a line whose text other lines have follows the one with most of the lines around it as they were", async ({
  agents,
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", `${functions.join("\n")}\n`);
  commitAll(repository);
  writeFile(repository, "a.txt", `${functions.with(4, "  return 3;").join("\n")}\n`);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "}", "End of a");

  const added = ["function z() {", "  return 0;", "}"];

  writeFile(repository, "a.txt", `${[...added, ...functions.with(4, "  return 3;")].join("\n")}\n`);

  await expect(line(page, "function z() {")).toBeVisible();
  await expectBetween(page, "End of a", "  return 1;", "function b() {");

  const reviewer = await agents.start("Reviewer");

  await sendTo(page, await openReview(page, 1), "Reviewer");

  await expect
    .poll(reviewer.sent)
    .toMatchObject([[prompt, { comments: [{ side: "new", lineNumber: 6, body: "End of a" }] }]]);
});

// A function of four lines, after another, each ending its own "}".
const longer = [...functions.slice(0, 4), "  one();", "  two();", "  three();", "  four();", "}"];

test("a comment started on a line alone in its part of the diff, whose text other lines have, as a file's last line after its last hunk, is on its line", async ({
  agents,
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", `${longer.join("\n")}\n`);
  commitAll(repository);
  writeFile(repository, "a.txt", `${longer.with(4, "  ONE();").join("\n")}\n`);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await line(page, "  ONE();").hover();
  await button(page, "Show entire file").click();
  await expect(line(page, "}")).toHaveCount(2);
  await line(page, "}").last().hover();
  await button(page, "Add review comment").click();
  await editor(page).fill("End of b");
  await button(page, "Save review comment").click();

  await expect(pending(page, "End of b")).toBeVisible();

  const last = await box(line(page, "}").last());
  const shown = await box(pending(page, "End of b"));

  expect(shown.y).toBeGreaterThan(last.y);

  const reviewer = await agents.start("Reviewer");

  await sendTo(page, await openReview(page, 1), "Reviewer");

  await expect
    .poll(reviewer.sent)
    .toMatchObject([[prompt, { comments: [{ side: "new", lineNumber: 9, body: "End of b" }] }]]);
});

test("a comment that follows its line while the review's being sent is no longer pending once it's sent", async ({
  agents,
  app,
  page,
  repository,
}) => {
  changeA(repository);

  const sends = await app.holdSends();

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "charlie", "Keep it");

  const reviewer = await agents.start("Reviewer");

  await sendTo(page, await openReview(page, 1), "Reviewer");
  await expect.poll(sends.held).toBe(1);
  await page.keyboard.press("Escape");
  await expect(review(page)).toBeHidden();

  writeFile(repository, "a.txt", "first\nkept\nalpha\nBRAVO\ncharlie\ndelta\n");

  await expect(line(page, "first")).toBeVisible();
  await expectBetween(page, "Keep it", "charlie", "delta");

  sends.release();

  await expect(page.getByText("Feedback sent to Reviewer.", { exact: true })).toBeVisible();
  await expect(pending(page, "Keep it")).toBeHidden();
  await expect
    .poll(reviewer.sent)
    .toMatchObject([[prompt, { comments: [{ side: "new", lineNumber: 4, body: "Keep it" }] }]]);
});

test("a comment on several lines is no longer in its diffs once its last is removed, and the one line left with its text is before its first", async ({
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectLines(page, "BRAVO", "charlie");
  await page
    .getByRole("toolbar", { name: "Selection", exact: true })
    .getByRole("button", { name: "Comment", exact: true })
    .click();
  await editor(page).fill("Why both?");
  await button(page, "Save review comment").click();
  await expectBetween(page, "Why both?", "charlie", "delta");

  writeFile(repository, "a.txt", "charlie\nkept\nalpha\nBRAVO\ndelta\n");

  await expect(line(page, "charlie")).toHaveCount(2);
  await expect(pending(page, "Why both?")).toBeHidden();
  await expect(pending(await openReview(page, 1), "Why both?")).toContainText(
    "No longer in its diffs",
  );
});
