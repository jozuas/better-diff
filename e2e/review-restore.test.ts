import { expect, test } from "./fixtures";
import { button, openFile } from "./panel";
import {
  changeA,
  comment,
  editor,
  messageBox,
  openReview,
  pending,
  review,
  sendTo,
  startComment,
} from "./review";

test("once a review's sent, until another comment's started, Restore sent review makes its comments pending again, with the message it was sent with, so it can be sent to another agent", async ({
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
  const second = await agents.start("Second");
  const opened = await openReview(page, 2);

  await messageBox(opened).fill("Fix these.");
  await sendTo(page, opened, "Reviewer");

  await expect(page.getByText("Feedback sent to Reviewer.", { exact: true })).toBeVisible();
  await expect(review(page)).toBeHidden();
  await expect(button(page, "Review (2)")).toBeHidden();

  await button(page, "Restore sent review").click();

  await expect(button(page, "Restore sent review")).toBeHidden();
  await expect(pending(page, "Why uppercase?")).toBeVisible();
  await expect(pending(page, "Not needed")).toBeVisible();

  const reopened = await openReview(page, 2);

  await expect(messageBox(reopened)).toHaveValue("Fix these.");

  await sendTo(page, reopened, "Second");

  await expect
    .poll(second.sent)
    .toMatchObject([
      [
        { type: "text", text: "Fix these." },
        { comments: [{ body: "Why uppercase?" }, { body: "Not needed" }] },
      ],
    ]);
  expect(reviewer.sent()).toHaveLength(1);

  await startComment(page, "charlie");

  await expect(editor(page)).toBeVisible();
  await expect(button(page, "Restore sent review")).toBeHidden();
});
