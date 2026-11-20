import { runGit, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { box, button, line, openFile, row } from "./panel";
import {
  changeA,
  changeAAndB,
  comment,
  editor,
  openReview,
  pending,
  prompt,
  sendTo,
  startComment,
} from "./review";

test("a line's comment is written under it, and is pending, edited and deleted until it's sent", async ({
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "BRAVO", "Why uppercase?");

  await expect(pending(page, "Why uppercase?")).toContainText("Pending");

  const above = await box(line(page, "BRAVO"));
  const shown = await box(pending(page, "Why uppercase?"));
  const below = await box(line(page, "charlie"));

  expect(shown.y).toBeGreaterThan(above.y);
  expect(shown.y).toBeLessThan(below.y);
  await expect(button(page, "Review (1)")).toBeVisible();

  await pending(page, "Why uppercase?")
    .getByRole("button", { name: "Edit review comment" })
    .click();

  await expect(editor(page)).toHaveValue("Why uppercase?");

  await editor(page).fill("Keep it lowercase.");
  await button(page, "Save review comment").click();

  await expect(pending(page, "Keep it lowercase.")).toBeVisible();
  await expect(pending(page, "Why uppercase?")).toBeHidden();

  await pending(page, "Keep it lowercase.")
    .getByRole("button", { name: "Delete review comment" })
    .click();

  await expect(pending(page, "Keep it lowercase.")).toBeHidden();
  await expect(button(page, "Review (1)")).toBeHidden();
});

test("a comment is saved with Enter, unless it's only whitespace, Shift+Enter starts a new line in it, and it's left with Escape or Cancel", async ({
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await startComment(page, "BRAVO");
  await editor(page).fill(" \n ");

  await expect(button(page, "Save review comment")).toBeDisabled();

  await editor(page).press("Enter");
  await editor(page).press("Escape");

  await expect(editor(page)).toBeHidden();
  await expect(page.getByRole("group", { name: "Pending review comment" })).toHaveCount(0);

  await startComment(page, "delta");
  await editor(page).fill("Why?");
  await editor(page).press("Shift+Enter");
  await editor(page).pressSequentially("And why here?");
  await editor(page).press("Enter");

  await expect(pending(page, "Why?\nAnd why here?")).toBeVisible();

  await startComment(page, "kept");
  await editor(page).fill("Never mind");
  await button(page, "Cancel review comment").click();

  await expect(editor(page)).toBeHidden();
  await expect(pending(page, "Never mind")).toBeHidden();
});

test("a press in a comment's box stays in it, and a right click there opens the page's own menu rather than the lines'", async ({
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await startComment(page, "BRAVO");
  await editor(page).click({ button: "right" });
  await editor(page).click();
  await page.keyboard.type("Typed in it");

  await expect(editor(page)).toHaveValue("Typed in it");
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("what's written of a comment stays as its file changes, under its line, which it follows, and shows nowhere while its line is changed", async ({
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await startComment(page, "BRAVO");
  await editor(page).fill("Why uppercase?");

  writeFile(repository, "a.txt", "first\nkept\nalpha\nBravo\ncharlie\ndelta\n");

  await expect(line(page, "Bravo")).toBeVisible();
  await expect(editor(page)).toBeHidden();

  writeFile(repository, "a.txt", "first\nkept\nalpha\nBRAVO\ncharlie\ndelta\n");

  await expect(editor(page)).toHaveValue("Why uppercase?");

  await button(page, "Save review comment").click();

  const under = await box(pending(page, "Why uppercase?"));
  const bravo = await box(line(page, "BRAVO"));
  const charlie = await box(line(page, "charlie"));

  expect(under.y).toBeGreaterThan(bravo.y);
  expect(under.y).toBeLessThan(charlie.y);
});

test("while a comment being written shows nowhere, as its line is changed, the bar under the diff says it's no longer in its diffs, beside Discard comment, which leaves it", async ({
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await startComment(page, "BRAVO");
  await editor(page).fill("Why uppercase?");

  const note = page.getByText("The comment being written is no longer in its diffs", {
    exact: true,
  });

  await expect(note).toBeHidden();

  writeFile(repository, "a.txt", "first\nkept\nalpha\nBravo\ncharlie\ndelta\n");

  await expect(note).toBeVisible();

  writeFile(repository, "a.txt", "first\nkept\nalpha\nBRAVO\ncharlie\ndelta\n");

  await expect(editor(page)).toHaveValue("Why uppercase?");
  await expect(note).toBeHidden();

  writeFile(repository, "a.txt", "first\nkept\nalpha\nBravo\ncharlie\ndelta\n");

  await expect(note).toBeVisible();
  await button(page, "Discard comment").click();
  await expect(note).toBeHidden();
  await expect(button(page, "Discard comment")).toBeHidden();

  writeFile(repository, "a.txt", "first\nkept\nalpha\nBRAVO\ncharlie\ndelta\n");

  await expect(line(page, "BRAVO")).toBeVisible();
  await expect(editor(page)).toBeHidden();
  await expect(pending(page, "Why uppercase?")).toBeHidden();
});

test("while an edit of a comment saved shows nowhere, as its line is changed, the bar under the diff says the comment being edited is no longer in its diffs, beside Discard edit, which leaves the comment as it was saved, still pending", async ({
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "BRAVO", "Why uppercase?");

  await pending(page, "Why uppercase?")
    .getByRole("button", { name: "Edit review comment" })
    .click();

  await editor(page).fill("Keep it lowercase.");

  const note = page.getByText("The comment being edited is no longer in its diffs", {
    exact: true,
  });

  writeFile(repository, "a.txt", "first\nkept\nalpha\nBravo\ncharlie\ndelta\n");

  await expect(note).toBeVisible();
  await expect(button(page, "Discard comment")).toBeHidden();
  await button(page, "Discard edit").click();
  await expect(note).toBeHidden();
  await expect(button(page, "Review (1)")).toBeVisible();

  writeFile(repository, "a.txt", "first\nkept\nalpha\nBRAVO\ncharlie\ndelta\n");

  await expect(pending(page, "Why uppercase?")).toBeVisible();
  await expect(pending(page, "Keep it lowercase.")).toBeHidden();
  await expect(editor(page)).toBeHidden();
});

test("each file's row in the sidebar says how many comments are pending on the file, in MODIFIED and STAGED alike for a partly staged file", async ({
  app,
  page,
  repository,
}) => {
  changeAAndB(repository);
  runGit(repository, ["add", "--", "b.txt"]);
  writeFile(repository, "b.txt", "one\nTWO\nthree\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");
  await comment(page, "BRAVO", "Why uppercase?");
  await comment(page, "delta", "Not needed");
  await openFile(page, "STAGED FILES (1)", "b.txt");
  await comment(page, "TWO", "Staged");

  await expect(
    row(page, "MODIFIED FILES (2)", "a.txt").getByLabel("2 pending comments", { exact: true }),
  ).toBeVisible();
  await expect(
    row(page, "STAGED FILES (1)", "b.txt").getByLabel("1 pending comment", { exact: true }),
  ).toBeVisible();
  await expect(
    row(page, "MODIFIED FILES (2)", "b.txt").getByLabel("1 pending comment", { exact: true }),
  ).toBeVisible();
});

test("in a group's view, each file's lines are commented on, and sent with their paths", async ({
  agents,
  app,
  page,
  repository,
}) => {
  changeAAndB(repository);

  await app.openPanel();
  await button(page, "MODIFIED FILES (2)").click();
  await comment(page, "BRAVO", "In a");
  await comment(page, "TWO", "In b");

  const reviewer = await agents.start("Reviewer");

  await sendTo(page, await openReview(page, 2), "Reviewer");

  await expect(page.getByText("Feedback sent to Reviewer.", { exact: true })).toBeVisible();
  await expect.poll(reviewer.sent).toMatchObject([
    [
      prompt,
      {
        comments: [
          { filePath: "a.txt", side: "new", lineNumber: 3, body: "In a" },
          { filePath: "b.txt", side: "new", lineNumber: 2, body: "In b" },
        ],
      },
    ],
  ]);
});

test.describe("side by side", () => {
  // Wide enough for the shared daemon's Auto style to show diffs side by side.
  test.use({ viewport: { width: 2048, height: 720 } });

  test("a comment is on the line of the side it's made on, under that side", async ({
    agents,
    app,
    page,
    repository,
  }) => {
    changeA(repository);

    await app.openPanel();
    await openFile(page, "MODIFIED FILES (1)", "a.txt");
    await comment(page, "charlie", "Old charlie");
    await line(page, "charlie").last().hover();
    await button(page, "Add review comment").click();
    await editor(page).fill("New charlie");
    await button(page, "Save review comment").click();

    const oldSide = await box(pending(page, "Old charlie"));
    const newSide = await box(pending(page, "New charlie"));

    expect(oldSide.x + oldSide.width).toBeLessThanOrEqual(newSide.x);
    expect(oldSide.y).toBe(newSide.y);

    const reviewer = await agents.start("Reviewer");

    await sendTo(page, await openReview(page, 2), "Reviewer");

    await expect(page.getByText("Feedback sent to Reviewer.", { exact: true })).toBeVisible();
    await expect.poll(reviewer.sent).toMatchObject([
      [
        prompt,
        {
          comments: [
            { side: "old", lineNumber: 4, body: "Old charlie" },
            { side: "new", lineNumber: 4, body: "New charlie" },
          ],
        },
      ],
    ]);
  });

  test("inline, an unchanged line shows the comments made on either of its sides", async ({
    app,
    page,
    repository,
  }) => {
    changeA(repository);

    await app.openPanel();
    await openFile(page, "MODIFIED FILES (1)", "a.txt");
    await comment(page, "charlie", "Old charlie");
    await page.setViewportSize({ width: 1024, height: 720 });

    await expect(line(page, "charlie")).toHaveCount(1);
    await expect(pending(page, "Old charlie")).toBeVisible();

    const opened = await openReview(page, 1);

    await opened.getByRole("button", { name: "Show line 4 of a.txt", exact: true }).click();

    await expect(pending(page, "Old charlie")).toBeInViewport();
  });
});
