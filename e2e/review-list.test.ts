import { expect, test } from "./fixtures";
import { openFile } from "./panel";
import {
  changeA,
  changeAAndB,
  comment,
  editor,
  messageBox,
  openReview,
  pending,
  review,
} from "./review";

test("discarding the review asks for confirmation, then deletes the comments and the message", async ({
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "BRAVO", "Why uppercase?");
  await comment(page, "delta", "Not needed");

  const opened = await openReview(page, 2);

  await messageBox(opened).fill("Fix these.");
  await opened.getByRole("button", { name: "Discard review", exact: true }).click();

  await expect(pending(opened, "Why uppercase?")).toBeVisible();

  await opened.getByRole("button", { name: "Confirm discard?", exact: true }).click();

  await expect(review(page)).toBeHidden();
  await expect(page.getByRole("group", { name: "Pending review comment" })).toHaveCount(0);

  await comment(page, "BRAVO", "Again");

  await expect(messageBox(await openReview(page, 1))).toHaveValue("");
});

test("the review lists the comments under their files, in the order of their lines, and shows one in its file's diff", async ({
  app,
  page,
  repository,
}) => {
  changeAAndB(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "b.txt");
  await comment(page, "TWO", "In b");
  await openFile(page, "MODIFIED FILES (2)", "a.txt");
  await comment(page, "delta", "Not needed");
  await comment(page, "BRAVO", "Why uppercase?");

  const opened = await openReview(page, 3);
  const files = opened.getByRole("list");

  await expect(files).toHaveCount(2);
  await expect(files.first()).toHaveAccessibleName("a.txt");
  await expect(files.first().getByRole("group")).toHaveText([
    /^\+3\s*BRAVO\s*Why uppercase\?/u,
    /^\+5\s*delta\s*Not needed/u,
  ]);
  await expect(files.last().getByRole("group")).toHaveText([/^\+2\s*TWO\s*In b/u]);

  await opened.getByRole("button", { name: "Show line 2 of b.txt", exact: true }).click();

  await expect(review(page)).toBeHidden();
  await expect(page.getByRole("heading").filter({ hasText: "b.txt" })).toBeVisible();
  await expect(pending(page, "In b")).toBeInViewport();
});

test("a comment edited in the review is edited there, and shows edited under its line", async ({
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "BRAVO", "Why uppercase?");

  const opened = await openReview(page, 1);

  await opened.getByRole("button", { name: "Edit review comment", exact: true }).click();

  await expect(editor(opened)).toHaveValue("Why uppercase?");
  await expect(editor(page)).toHaveCount(1);

  await editor(opened).fill("Keep it lowercase.");
  await opened.getByRole("button", { name: "Save review comment", exact: true }).click();

  await expect(pending(opened, "Keep it lowercase.")).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(review(page)).toBeHidden();
  await expect(pending(page, "Keep it lowercase.")).toBeVisible();
});

test("Escape leaves a comment being edited in the review, and the review stays open", async ({
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "BRAVO", "Why uppercase?");

  const opened = await openReview(page, 1);

  await opened.getByRole("button", { name: "Edit review comment", exact: true }).click();
  await editor(opened).fill("Changed my mind");
  await editor(opened).press("Escape");

  await expect(editor(opened)).toHaveCount(0);
  await expect(pending(opened, "Why uppercase?")).toBeVisible();
  await expect(review(page)).toBeVisible();
});
