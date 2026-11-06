import type { Page } from "@playwright/test";

import { commitAll, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { fileBar, hunkBar } from "./keyboard";
import { box, button, line } from "./panel";

// Expects the key to show under the button with the name, from its right edge.
async function expectKeyUnder(page: Page, name: string, key: RegExp): Promise<void> {
  await expect
    .poll(async () => {
      const under = await box(button(page, name));
      const shown = await box(page.getByRole("tooltip").filter({ hasText: key }));

      return (
        shown.y >= under.y + under.height &&
        Math.abs(shown.x + shown.width - (under.x + under.width)) < 1
      );
    })
    .toBe(true);
}

test("opening the panel, unless focus is in a text field, moves focus to the open file's row", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");

  await app.openPanel();

  await expect(button(page, "a.txt")).toBeFocused();
});

test("opening the panel while focus is in a text field, as Paseo's command center's, leaves focus there", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");

  const list = await app.holdList();

  await app.openPanel();
  await page.keyboard.press("ControlOrMeta+K");
  await expect(page.locator("input:focus")).toHaveCount(1);
  list();

  await expect(button(page, "a.txt")).toBeVisible();
  await expect(page.locator("input:focus")).toHaveCount(1);
  await expect(button(page, "a.txt")).not.toBeFocused();
});

// Asks Paseo's command center for Better Diff: its own item, rather than a workspace whose name
// has the words too, as the tests' have.
async function askCommandCenter(page: Page): Promise<void> {
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("Better Diff");
  await page.getByRole("dialog").getByRole("button", { name: "Better Diff", exact: true }).click();
}

test("Better Diff in Paseo's command center opens the panel with focus in the open file's row", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");

  await app.showWorkspace();
  await askCommandCenter(page);

  await expect(button(page, "a.txt")).toBeFocused();

  await page.getByRole("textbox", { name: "Filter files" }).click();
  await askCommandCenter(page);

  await expect(button(page, "a.txt")).toBeFocused();
});

// Whether focus is in the panel, which has the filter and the hunk's bar, and how many elements in
// it Tab reaches. A string, since the tests typecheck without the DOM library.
const tabbing = `(() => {
  const filter = document.querySelector('[aria-label="Filter files"]');
  const bar = document.querySelector('[role="group"][aria-label="Hunk 1 of a.txt"]');
  let panel = filter;

  while (panel !== null && !panel.contains(bar)) {
    panel = panel.parentElement;
  }

  return {
    focused: panel.contains(document.activeElement),
    reached: [...panel.querySelectorAll("*")].filter((element) => element.tabIndex >= 0).length,
  };
})()`;

test("Tab reaches nothing in the panel: every action has a key of its own, and Tab moves focus on out of the panel", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "b\n");

  await app.openPanel();
  await expect(button(page, "a.txt")).toBeFocused();
  await expect(line(page, "b")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(hunkBar(page, "a.txt")).toBeFocused();

  expect(await page.evaluate(tabbing)).toStrictEqual({ focused: true, reached: 0 });

  await page.keyboard.press("Tab");

  expect(await page.evaluate(tabbing)).toStrictEqual({ focused: false, reached: 0 });
});

test("Better Diff's settings page lists all the keys, by where focus is", async ({ app, page }) => {
  await app.openSettings();

  await expect(page.getByText("Keys in the file list", { exact: true })).toBeVisible();
  await expect(page.getByText("Move to the filter", { exact: true })).toBeVisible();
  await expect(page.getByText("Stage the lines", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Menu {2}(?:⇧F10|Shift\+F10)$/u)).toBeVisible();
});

test("once focus rests on a bar for a second, Enter and Backspace show under the buttons they press from there", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "1\n2\n3\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "1\nx\n3\n");

  const tips = page.getByRole("tooltip");
  const enter = /^(?:↩|Enter)$/u;
  const backspace = /^(?:⌫|Backspace)$/u;

  await app.openPanel();
  await hunkBar(page, "a.txt").focus();

  await expect(tips).toHaveCount(2);
  await expectKeyUnder(page, "Stage Hunk", enter);
  await expectKeyUnder(page, "Discard Hunk", backspace);

  await page.keyboard.press("ArrowRight");

  await expectKeyUnder(page, "Stage Lines", enter);
  await expectKeyUnder(page, "Discard Lines", backspace);
  await expect(tips).toHaveCount(2);

  await page.keyboard.press("Escape");
  await page.keyboard.press("ArrowUp");

  await expect(fileBar(page, "MODIFIED a.txt")).toBeFocused();
  await expectKeyUnder(page, "Stage", enter);
  await expectKeyUnder(page, "Discard", backspace);
  await expect(tips).toHaveCount(2);
});
