import type { Locator, Page } from "@playwright/test";
import { z } from "zod";

import { commitAll, runGit, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { box, button, line, openFile, selectLines } from "./panel";
import { changeA, editor, expectBetween, openReview, pending, sendTo } from "./review";

function selectionBar(page: Page): Locator {
  return page.getByRole("toolbar", { name: "Selection", exact: true });
}

// What the page's text selection has. A string, since the tests typecheck without the DOM library.
async function selectedText(page: Page): Promise<string> {
  return z.string().parse(await page.evaluate("getSelection().toString()"));
}

// Right-clicks the line's text, and picks Comment from the menu of its file's lines.
async function commentFromMenu(page: Page, text: string): Promise<void> {
  await line(page, text).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Comment", exact: true }).click();
}

async function save(page: Page, body: string): Promise<void> {
  await editor(page).fill(body);
  await button(page, "Save review comment").click();
}

// Commits `a.txt`, stages a change to its second line, and changes that line again in the worktree,
// so that the staged diff adds a line only the index has.
function changeOnlyInIndex(repository: string): void {
  writeFile(repository, "a.txt", "one\ntwo\nthree\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "one\nTWO\nthree\n");
  runGit(repository, ["add", "a.txt"]);
  writeFile(repository, "a.txt", "one\nTwo\nthree\n");
}

test("letting go of a selection of a diff's lines shows a bar just above where it was let go, whose Comment starts a comment on the selected lines, under the last, and clears the selection", async ({
  agents,
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectLines(page, "alpha", "BRAVO");

  const letGo = await box(line(page, "BRAVO"));
  const bar = await box(selectionBar(page));

  expect(bar.y + bar.height).toBeLessThan(letGo.y + letGo.height / 2);
  expect(bar.y + bar.height).toBeGreaterThan(letGo.y - letGo.height);

  await selectionBar(page).getByRole("button", { name: "Comment", exact: true }).click();

  await expect(editor(page)).toBeFocused();
  await expect(page.getByText("Lines 2\u20133", { exact: true })).toBeVisible();
  await expect(selectionBar(page)).toBeHidden();
  expect(await selectedText(page)).toBe("");

  await save(page, "Why uppercase?");
  await expectBetween(page, "Why uppercase?", "BRAVO", "charlie");
  await expect(pending(page, "Why uppercase?")).toContainText("Lines 2\u20133");

  const reviewer = await agents.start("Reviewer");

  await sendTo(page, await openReview(page, 1), "Reviewer");

  await expect.poll(reviewer.sent).toMatchObject([
    [
      {},
      {
        comments: [
          {
            side: "new",
            lineNumber: 3,
            body: "Lines 2\u20133: Why uppercase?",
            context: {
              targetLine: { content: "BRAVO" },
              lines: ["kept", "alpha", "bravo", "BRAVO", "charlie", "delta"].map((content) => ({
                content,
              })),
            },
          },
        ],
      },
    ],
  ]);
});

test("a comment from a removed line to an added one starts in HEAD and ends in the worktree, and says so under its line, in the review, and to the agent", async ({
  agents,
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectLines(page, "bravo", "BRAVO");
  await selectionBar(page).getByRole("button", { name: "Comment", exact: true }).click();
  await save(page, "Why?");

  await expect(pending(page, "Why?")).toContainText("Lines \u22123 to +3");

  const reviewer = await agents.start("Reviewer");
  const opened = await openReview(page, 1);

  await expect(
    opened.getByRole("button", { name: "Show lines \u22123 to +3 of a.txt", exact: true }),
  ).toContainText("\u22123 to +3");

  await sendTo(page, opened, "Reviewer");

  await expect
    .poll(reviewer.sent)
    .toMatchObject([
      [{}, { comments: [{ side: "new", lineNumber: 3, body: "Lines \u22123 to +3: Why?" }] }],
    ]);
});

test("a selection's comment is on its lines from the first that can be commented on to the last, and the bar has no Comment where none can be", async ({
  app,
  page,
  repository,
}) => {
  changeOnlyInIndex(repository);

  await app.openPanel();
  await openFile(page, "STAGED FILES (1)", "a.txt");
  await selectLines(page, "TWO");

  await expect(selectionBar(page).getByRole("button", { name: "Copy", exact: true })).toBeVisible();
  await expect(selectionBar(page).getByRole("button", { name: "Comment" })).toHaveCount(0);

  await selectLines(page, "one", "TWO");
  await selectionBar(page).getByRole("button", { name: "Comment", exact: true }).click();
  await save(page, "Gone from HEAD");

  await expectBetween(page, "Gone from HEAD", "two", "TWO");
  await expect(pending(page, "Gone from HEAD")).toContainText("Lines 1\u20132");
  expect(runGit(repository, ["show", ":a.txt"])).toBe("one\nTWO\nthree\n");
});

test("the bar a selection shows goes once the selection's cleared, or once the pointer's pressed in the lines again", async ({
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await selectLines(page, "alpha", "BRAVO");

  await expect(selectionBar(page)).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(selectionBar(page)).toBeHidden();

  await selectLines(page, "charlie");

  await expect(selectionBar(page)).toBeVisible();

  await line(page, "kept").click();

  await expect(selectionBar(page)).toBeHidden();
});

test("Comment in the menu of a diff's lines starts a comment on the line right-clicked, or on the selected lines", async ({
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await commentFromMenu(page, "alpha");

  await expect(editor(page)).toBeFocused();

  await save(page, "On alpha");
  await expectBetween(page, "On alpha", "alpha", "bravo");

  await selectLines(page, "kept", "alpha");
  await commentFromMenu(page, "kept");

  await expect(editor(page)).toBeFocused();
  expect(await selectedText(page)).toBe("");

  await save(page, "On the selection");

  await expect(pending(page, "On the selection")).toContainText("Lines 1\u20132");
  await expectBetween(page, "On the selection", "alpha", "bravo");
  await expect(pending(page, "On alpha")).not.toContainText("Lines");
});

test("the menu's Comment is disabled on a line that can't be commented on", async ({
  app,
  page,
  repository,
}) => {
  changeOnlyInIndex(repository);

  await app.openPanel();
  await openFile(page, "STAGED FILES (1)", "a.txt");
  await line(page, "TWO").click({ button: "right" });

  await expect(page.getByRole("menuitem", { name: "Comment", exact: true })).toBeDisabled();
  expect(runGit(repository, ["show", ":a.txt"])).toBe("one\nTWO\nthree\n");
});

test.describe("side by side", () => {
  // Wide enough for the shared daemon's Auto style to show diffs side by side.
  test.use({ viewport: { width: 2048, height: 720 } });

  test("a selection's comment is on the side it's made on", async ({
    agents,
    app,
    page,
    repository,
  }) => {
    changeA(repository);

    await app.openPanel();
    await openFile(page, "MODIFIED FILES (1)", "a.txt");
    await line(page, "bravo").click();
    await selectLines(page, "bravo");
    await selectionBar(page).getByRole("button", { name: "Comment", exact: true }).click();
    await save(page, "Old bravo");

    const reviewer = await agents.start("Reviewer");

    await sendTo(page, await openReview(page, 1), "Reviewer");

    await expect
      .poll(reviewer.sent)
      .toMatchObject([[{}, { comments: [{ side: "old", lineNumber: 3, body: "Old bravo" }] }]]);
  });
});
