import { basename } from "node:path";

import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { button, openFile } from "./panel";
import { refuseChanges } from "./refusing";
import { changeA, comment, messageBox, openReview, pending } from "./review";

// What the row of the repository's workspace in Paseo's sidebar says of its comments pending, if
// anything, among those of its project, which is named after the repository's directory.
function badges(page: Page, repository: string): Locator {
  return page
    .getByRole("group", { name: basename(repository), exact: true })
    .getByLabel(/^Pending review: /u);
}

test("pending comments and the review's message are kept on the workspace: they stay once Paseo reloads, and once the tab closes, which it does without asking", async ({
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "BRAVO", "Why uppercase?");
  await messageBox(await openReview(page, 1)).fill("Fix these.");
  await page.reload();

  await expect(pending(page, "Why uppercase?")).toBeVisible();
  await expect(messageBox(await openReview(page, 1))).toHaveValue("Fix these.");

  await page.keyboard.press("Escape");
  // The tab shows what closes it while the pointer is over it.
  await button(page, "Better Diff").hover();
  await button(page, "Close").click();

  await expect(pending(page, "Why uppercase?")).toBeHidden();

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(pending(page, "Why uppercase?")).toBeVisible();
  await expect(messageBox(await openReview(page, 1))).toHaveValue("Fix these.");
});

test("pending comments and the review's message show on the host's other clients, where a comment made or deleted on one shows at once", async ({
  app,
  page,
  otherDevice,
  repository,
}) => {
  const other = otherDevice.page;

  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "BRAVO", "Why uppercase?");
  await otherDevice.app.openPanel();
  await openFile(other, "MODIFIED FILES (1)", "a.txt");

  await expect(pending(other, "Why uppercase?")).toBeVisible();

  await comment(page, "delta", "And this?");

  await expect(pending(other, "And this?")).toBeVisible();

  await messageBox(await openReview(page, 2)).fill("Fix these.");
  await page.keyboard.press("Escape");

  await expect(messageBox(await openReview(other, 2))).toHaveValue("Fix these.");

  await other.keyboard.press("Escape");
  await pending(other, "Why uppercase?")
    .getByRole("button", { name: "Delete review comment", exact: true })
    .click();

  await expect(pending(page, "Why uppercase?")).toBeHidden();
  await expect(button(page, "Review (1)")).toBeVisible();
});

test("while a workspace has comments pending, its row in Paseo's sidebar says how many, on every client, whether or not its Better Diff tab is open, until the review is discarded", async ({
  app,
  page,
  otherDevice,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await otherDevice.app.showWorkspace();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(badges(page, repository)).toHaveCount(0);

  await comment(page, "BRAVO", "Why uppercase?");

  await expect(badges(page, repository)).toHaveText(["1 comment"]);
  await expect(badges(page, repository)).toHaveAccessibleName("Pending review: 1 comment");
  await expect(badges(otherDevice.page, repository)).toHaveText(["1 comment"]);

  await comment(page, "delta", "And this?");

  await expect(badges(page, repository)).toHaveText(["2 comments"]);
  await expect(badges(otherDevice.page, repository)).toHaveText(["2 comments"]);

  const opened = await openReview(page, 2);

  await opened.getByRole("button", { name: "Discard review", exact: true }).click();
  await opened.getByRole("button", { name: "Confirm discard?", exact: true }).click();

  await expect(badges(page, repository)).toHaveCount(0);
  await expect(badges(otherDevice.page, repository)).toHaveCount(0);
});

const notSaved = "The review isn't saved on the workspace yet. Better Diff will keep trying.";

test("a change that can't be kept still shows, says the review isn't saved on the workspace yet, and is tried again every five seconds until it's kept", async ({
  app,
  page,
  otherDevice,
  repository,
}) => {
  changeA(repository);

  const allow = await refuseChanges(page);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "BRAVO", "Why uppercase?");

  await expect(page.getByText(notSaved, { exact: true })).toBeVisible();
  await expect(pending(page, "Why uppercase?")).toBeVisible();

  await otherDevice.app.openPanel();
  await openFile(otherDevice.page, "MODIFIED FILES (1)", "a.txt");
  // Long enough for the comment to have been tried again, and refused.
  await otherDevice.page.waitForTimeout(6000);

  await expect(pending(otherDevice.page, "Why uppercase?")).toBeHidden();

  await allow();

  await expect(pending(otherDevice.page, "Why uppercase?")).toBeVisible({ timeout: 10_000 });
});

test("the review's message is kept as it's typed, so it stays though Paseo reloads at once", async ({
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "BRAVO", "Why uppercase?");
  await messageBox(await openReview(page, 1)).fill("Fix these.");
  await page.reload();

  await expect(messageBox(await openReview(page, 1))).toHaveValue("Fix these.");
});

test("\"Pending review comments\" in the Show menu of Paseo's sidebar hides the count of a workspace's comments pending", async ({
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "BRAVO", "Why uppercase?");

  await expect(badges(page, repository)).toHaveText(["1 comment"]);

  await page.getByLabel("Display preferences", { exact: true }).click();
  await page.getByRole("menuitem", { name: "Show", exact: true }).click();
  await page.getByRole("menuitem", { name: "Pending review comments", exact: true }).click();

  await expect(badges(page, repository)).toHaveCount(0);
});
