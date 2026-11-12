import type { Locator, Page } from "@playwright/test";

import { writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { hunkBar } from "./keyboard";
import { changeLines } from "./numbered";
import { line, openFile } from "./panel";
import {
  comment,
  editor,
  expectBetween,
  openReview,
  pending,
  prompt,
  review,
  sendTo,
} from "./review";

// The count on the second hunk's bar of the three unchanged lines left out above it, after the first
// hunk, which shows them.
function threeLeftOut(page: Page): Locator {
  return hunkBar(page, "a.txt", 2).getByRole("button", { name: "3 unchanged lines", exact: true });
}

// The unchanged lines 104 to 106 the hunks of changes to lines 100 and 110 leave out between them.
function around(number: number) {
  return { oldLineNumber: number, newLineNumber: number, type: "context", content: `a ${number}` };
}

test("an unchanged line outside the hunks, while it shows, is commented on as a hunk's is, from its button or its menu, and the comment's sent with the unchanged lines around it", async ({
  agents,
  app,
  page,
  repository,
}) => {
  changeLines(repository, [100, 110]);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await threeLeftOut(page).click();
  await comment(page, "a 105", "Update this too");

  await expectBetween(page, "Update this too", "a 105", "a 106");

  await line(page, "a 104").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Comment", exact: true }).click();

  await expect(editor(page)).toBeFocused();

  await editor(page).fill("And this");
  await editor(page).press("Enter");

  await expectBetween(page, "And this", "a 104", "a 105");

  const reviewer = await agents.start("Reviewer");
  const opened = await openReview(page, 2);

  await expect(pending(opened, "Update this too")).toContainText(/105\s*a 105/u);

  await sendTo(page, opened, "Reviewer");

  await expect.poll(reviewer.sent).toMatchObject([
    [
      prompt,
      {
        comments: [
          {
            filePath: "a.txt",
            side: "new",
            lineNumber: 104,
            body: "And this",
            context: {
              hunkHeader: "@@ -104,3 +104,3 @@",
              targetLine: around(104),
              lines: [around(104), around(105), around(106)],
            },
          },
          {
            filePath: "a.txt",
            side: "new",
            lineNumber: 105,
            body: "Update this too",
            context: { hunkHeader: "@@ -104,3 +104,3 @@", targetLine: around(105) },
          },
        ],
      },
    ],
  ]);
});

test("the unchanged lines around a line commented on show, though they aren't asked to, as once the file's opened again after Paseo reloads, from the review, which shows the comment there", async ({
  app,
  page,
  repository,
}) => {
  changeLines(repository, [100, 110]);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await threeLeftOut(page).click();
  await comment(page, "a 105", "Update this too");
  writeFile(repository, "b.txt", "b\n");
  await openFile(page, "UNTRACKED FILES (1)", "b.txt");
  await page.reload();

  const opened = await openReview(page, 1);

  await opened.getByRole("button", { name: "Show line 105 of a.txt", exact: true }).click();

  await expect(review(page)).toBeHidden();
  await expect(pending(page, "Update this too")).toBeInViewport();

  await expectBetween(page, "Update this too", "a 105", "a 106");
  await expect(threeLeftOut(page)).toBeHidden();
  await expect(line(page, "a 96")).toBeHidden();
});

test("nothing hides a run of unchanged lines with a line commented on: its hunk's bar has nothing in its middle that does, and E doesn't", async ({
  app,
  page,
  repository,
}) => {
  changeLines(repository, [100, 110]);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await threeLeftOut(page).click();
  await comment(page, "a 105", "Keep this");
  await line(page, "a 110 changed").hover();

  await expect(page.getByRole("button", { name: "Discard Hunk" }).last()).toHaveCSS("opacity", "1");
  await expect(
    hunkBar(page, "a.txt", 2).getByRole("button", { name: /unchanged lines?$/u }),
  ).toHaveCount(0);

  await hunkBar(page, "a.txt", 2).focus();
  await page.keyboard.press("e");
  await page.keyboard.press("Shift+E");

  await expect(line(page, "a 200")).toBeVisible();

  await page.keyboard.press("Shift+E");

  await expect(line(page, "a 200")).toBeHidden();
  await expect(line(page, "a 105")).toBeVisible();
  await expect(line(page, "a 104")).toBeVisible();
});
