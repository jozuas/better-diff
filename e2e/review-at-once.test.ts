import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { button, openFile } from "./panel";
import { refuseChanges } from "./refusing";
import { changeA, comment, editor, messageBox, openReview, pending } from "./review";

const notSaved = "The review isn't saved on the workspace yet. Better Diff will keep trying.";

// Has the page show both comments, and only them.
async function expectBoth(page: Page, mine: string, theirs: string): Promise<void> {
  await expect(pending(page, mine)).toBeVisible();
  await expect(pending(page, theirs)).toBeVisible();
  await expect(button(page, "Review (2)")).toBeVisible();
}

test("an edit isn't saved to a comment that another client has edited since the edit started, which stays as that client saved it", async ({
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
  await pending(page, "Why uppercase?")
    .getByRole("button", { name: "Edit review comment" })
    .click();
  await editor(page).fill("Mine.");
  await pending(other, "Why uppercase?")
    .getByRole("button", { name: "Edit review comment" })
    .click();
  await editor(other).fill("Theirs.");
  await button(other, "Save review comment").click();
  // The page hears of the comments in the order the other client changed them.
  await comment(other, "delta", "And this?");

  await expect(pending(page, "And this?")).toBeVisible();

  await button(page, "Save review comment").click();

  await expect(pending(page, "Theirs.")).toBeVisible();
  await expect(pending(page, "Mine.")).toBeHidden();
  await expect(pending(other, "Theirs.")).toBeVisible();
});

// Has the page show the comment the other client made while the first couldn't keep its own, and
// not the one it deleted then, beside the first's.
async function expectMineAndTheirs(page: Page): Promise<void> {
  await expect(pending(page, "Mine.")).toBeVisible();
  await expect(pending(page, "Why uppercase?")).toBeHidden();
  await expect(button(page, "Review (2)")).toBeVisible();
}

test("a comment kept late, as one made while the host couldn't be reached, neither brings back comments another client deleted meanwhile nor takes away those it made", async ({
  app,
  page,
  otherDevice,
  repository,
}) => {
  const other = otherDevice.page;

  changeA(repository);

  const allow = await refuseChanges(page);

  await otherDevice.app.openPanel();
  await openFile(other, "MODIFIED FILES (1)", "a.txt");
  await comment(other, "BRAVO", "Why uppercase?");
  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expect(pending(page, "Why uppercase?")).toBeVisible();

  await comment(page, "delta", "And this?");

  await expect(page.getByText(notSaved, { exact: true })).toBeVisible();

  await pending(other, "Why uppercase?")
    .getByRole("button", { name: "Delete review comment", exact: true })
    .click();
  await comment(other, "charlie", "Mine.");
  await allow();

  // Tried again five seconds after it couldn't be kept.
  await expect(pending(other, "And this?")).toBeVisible({ timeout: 10_000 });
  await expectMineAndTheirs(page);
  await expectMineAndTheirs(other);
});

test("comments made at the same moment on two clients all stand, on both", async ({
  app,
  page,
  otherDevice,
  repository,
}) => {
  const other = otherDevice.page;

  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await otherDevice.app.openPanel();
  await openFile(other, "MODIFIED FILES (1)", "a.txt");
  await Promise.all([comment(page, "BRAVO", "Mine."), comment(other, "delta", "Theirs.")]);

  await expectBoth(page, "Mine.", "Theirs.");
  await expectBoth(other, "Mine.", "Theirs.");
});

test("where two clients type the review's message at the same moment, the one the host reaches last stands, on both", async ({
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

  const mine = messageBox(await openReview(page, 1));
  const theirs = messageBox(await openReview(other, 1));

  await Promise.all([mine.fill("Mine."), theirs.fill("Theirs.")]);

  await expect
    .poll(async () => {
      const shown = await mine.inputValue();

      return shown;
    })
    .toBe(await theirs.inputValue());
  expect(["Mine.", "Theirs."]).toContain(await mine.inputValue());
});
