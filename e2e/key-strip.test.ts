import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { changeTwoHunks, heading, hunkBar } from "./keyboard";
import { box, button, line, openFile } from "./panel";

function strip(page: Page): Locator {
  return page.getByRole("note", { name: "Keys", exact: true });
}

// A hint in the strip, by its keys, as a Mac writes them or as other computers do, and what they do.
function hint(page: Page, keys: string, does: string): Locator {
  return strip(page).getByText(new RegExp(`^(?:${keys}) ${does}$`, "u"));
}

test("a strip along the bottom of the panel shows the keys that work where focus is, and what each does there, the keys of its actions first", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await expect(button(page, "a.txt")).toBeFocused();
  await expect(line(page, "first")).toBeVisible();

  await expect(hint(page, "↩|Enter", "Stage")).toBeVisible();
  await expect(hint(page, "⌫|Backspace", "Discard")).toBeVisible();
  await expect(strip(page)).toHaveText(/^(?:↩|Enter) Stage(?:⌫|Backspace) Discard↓ ↑ Move→ Diff/u);

  await page.keyboard.press("ArrowRight");
  await expect(hunkBar(page, "a.txt")).toBeFocused();

  await expect(hint(page, "↩|Enter", "Stage Hunk")).toBeVisible();
  await expect(hint(page, "⇧↩|Shift\\+Enter", "Stage File")).toBeVisible();
  await expect(hint(page, "→", "Lines")).toBeVisible();

  await page.keyboard.press("ArrowRight");

  await expect(hint(page, "↩|Enter", "Stage Lines")).toBeVisible();
  await expect(hint(page, "Esc", "Hunk")).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(hint(page, "↩|Enter", "Stage Hunk")).toBeVisible();

  await page.keyboard.press("ArrowUp");

  await expect(hint(page, "↩|Enter", "Stage")).toBeVisible();
  await expect(hint(page, "←", "File list")).toBeVisible();
});

test("the strip names what a key does where focus is now: Unstage in STAGED, Expand on a collapsed group's heading, and the filter's and the find bar's own keys", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await expect(button(page, "a.txt")).toBeFocused();
  await page.keyboard.press("Enter");
  await openFile(page, "STAGED FILES (1)", "a.txt");

  await expect(hint(page, "↩|Enter", "Unstage")).toBeVisible();
  await expect(hint(page, "⌫|Backspace", ".*")).toHaveCount(0);

  await page.keyboard.press("ArrowUp");
  await expect(heading(page, "STAGED FILES (1)")).toBeFocused();

  await expect(hint(page, "⇧↩|Shift\\+Enter", "Unstage All")).toBeVisible();
  await expect(hint(page, "←", "Collapse")).toBeVisible();

  await page.keyboard.press("ArrowLeft");

  await expect(hint(page, "→", "Expand")).toBeVisible();
  await expect(hint(page, "←", "Collapse")).toHaveCount(0);

  await page.keyboard.press("/");

  await expect(hint(page, "↓", "First file")).toBeVisible();
  await expect(hint(page, "Esc", "File list")).toBeVisible();

  await page.keyboard.type("a");

  await expect(hint(page, "Esc", "Clear")).toBeVisible();

  await page.keyboard.press("ControlOrMeta+F");

  await expect(hint(page, "⌥C|Alt\\+C", "Match case")).toBeVisible();
  await expect(strip(page).getByText(/Filter$/u)).toHaveCount(0);
});

test("the strip is one line, as tall with hints as without, leaves out whole the hints it has no room for, and is empty with focus outside the panel", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await page.setViewportSize({ width: 900, height: 700 });
  await app.openPanel();
  await expect(button(page, "a.txt")).toBeFocused();
  await expect(line(page, "first")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(hunkBar(page, "a.txt")).toBeFocused();
  await expect(hint(page, "↩|Enter", "Stage Hunk")).toBeVisible();

  const shown = await box(strip(page));
  const hints = await strip(page).locator(":scope > *").all();
  const boxes = await Promise.all(hints.map(box));
  const inside = boxes.filter(({ y }) => y < shown.y + shown.height);

  expect(inside.length).toBeGreaterThan(0);
  expect(inside.length).toBeLessThan(boxes.length);
  expect(inside.filter(({ x, width }) => x + width > shown.x + shown.width)).toStrictEqual([]);

  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Tab");

  await expect(strip(page)).toHaveText("");

  const empty = await box(strip(page));

  expect(empty.height).toBe(shown.height);

  await strip(page).click();

  await expect(hint(page, "↓", "File list")).toBeVisible();
  await expect(hint(page, "/", "Filter")).toBeVisible();
});
