import type { Page } from "@playwright/test";
import { z } from "zod";

import { writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { box, button, dragBy, dragFrom, group, openFile, row } from "./panel";

test("dragging the separator between the file list and the diff resizes the file list, which keeps its width in the tab", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", "a.txt");

  const separator = page.getByRole("slider", { name: "File list width" });
  const fileBar = page.getByRole("heading", { name: "UNTRACKED a.txt" });
  const before = await box(fileBar);

  await dragBy(page, separator, 100);

  await expect(separator).toHaveAttribute("aria-valuenow", "380");

  const after = await box(fileBar);

  expect(after.x).toBe(before.x + 100);
  expect(await page.evaluate("window.getSelection().toString()")).toBe("");

  await page.reload();

  await expect(separator).toHaveAttribute("aria-valuenow", "380");
});

test("with focus on the separator, → widens the file list by 10 pixels and ← narrows it by 10, or by 50 with Shift", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");

  await app.openPanel();

  const separator = page.getByRole("slider", { name: "File list width" });

  await separator.focus();
  await expect(separator).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(separator).toHaveAttribute("aria-valuenow", "290");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(separator).toHaveAttribute("aria-valuenow", "340");
  await page.keyboard.press("ArrowLeft");
  await expect(separator).toHaveAttribute("aria-valuenow", "330");
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(separator).toHaveAttribute("aria-valuenow", "280");
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(separator).toHaveAttribute("aria-valuenow", "230");

  await page.reload();

  await expect(separator).toHaveAttribute("aria-valuenow", "230");
});

test("the file list is no narrower than 160, and leaves the diff no narrower than 240", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", "a.txt");

  const separator = page.getByRole("slider", { name: "File list width" });

  await dragBy(page, separator, -1000);

  await expect(separator).toHaveAttribute("aria-valuenow", "160");

  await dragBy(page, separator, 5000);

  await expect
    .poll(async () => {
      const fileBar = await box(page.getByRole("heading", { name: "UNTRACKED a.txt" }));

      return fileBar.width;
    })
    .toBe(240);
});

test("the separator can be grabbed a few pixels either side of its line", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");

  await app.openPanel();

  const separator = page.getByRole("slider", { name: "File list width" });
  const { x, y, width, height } = await box(separator);
  const middle = x + width / 2;

  await dragFrom(page, middle - 5, y + height / 2, 50);

  await expect(separator).toHaveAttribute("aria-valuenow", "330");

  await dragFrom(page, middle + 50 + 5, y + height / 2, 50);

  await expect(separator).toHaveAttribute("aria-valuenow", "380");
});

// Whether the file list cuts the path short, to fit the row it's in.
async function cutShort(page: Page, path: string): Promise<boolean> {
  const text = JSON.stringify(`[aria-label="${path}"] [dir="auto"]`);

  const cut = await page.evaluate(
    `(() => { const text = document.querySelector(${text}); return text.scrollWidth > text.clientWidth; })()`,
  );

  return z.boolean().parse(cut);
}

test("double-clicking the separator fits the file list to its longest path", async ({
  app,
  page,
  repository,
}) => {
  const path = "some/rather/deeply/nested/directory/with-a-long-file-name.txt";

  writeFile(repository, path, "a\n");

  await app.openPanel();

  const separator = page.getByRole("slider", { name: "File list width" });

  await expect(group(page, "UNTRACKED FILES (1)")).toHaveText([path]);
  expect(await cutShort(page, path)).toBe(true);

  await separator.dblclick();

  await expect
    .poll(async () => {
      const cut = await cutShort(page, path);

      return cut;
    })
    .toBe(false);
  await expect(separator).not.toHaveAttribute("aria-valuenow", "280");
});

// Where on the page the text of the element the selector finds ends.
async function textEnd(page: Page, selector: string): Promise<number> {
  const element = JSON.stringify(selector);

  const end = await page.evaluate(
    `(() => { const range = document.createRange(); range.selectNodeContents(document.querySelector(${element})); return range.getBoundingClientRect().right; })()`,
  );

  return z.number().parse(end);
}

test("double-clicking the separator fits the file list to a path beside its row's buttons", async ({
  app,
  page,
  repository,
}) => {
  const path = "some/rather/deeply/nested/directory/with-a-long-file-name.txt";

  writeFile(repository, path, "a\n");

  await app.openPanel();
  await openFile(page, "UNTRACKED FILES (1)", path);

  const text = `[aria-label="${path}"] [dir="auto"]`;

  const deleteButton = row(page, "UNTRACKED FILES (1)", path).getByRole("button", {
    name: `Delete ${path}`,
  });

  const before = await box(deleteButton);

  expect(await textEnd(page, text)).toBeGreaterThan(before.x);

  await page.getByRole("slider", { name: "File list width" }).dblclick();

  await expect
    .poll(async () => {
      const end = await textEnd(page, text);
      const after = await box(deleteButton);

      return end <= after.x;
    })
    .toBe(true);
  expect(await cutShort(page, path)).toBe(false);
});

test("double-clicking the separator narrows the file list to fit a group's heading beside its buttons", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a", "a\n");

  await app.openPanel();
  await page.getByRole("button", { name: "UNTRACKED FILES (1)", exact: true }).click();

  const text = '[aria-label="UNTRACKED FILES (1)"] [role="heading"]';
  const deleteAll = button(page, "Delete All");
  const separator = page.getByRole("slider", { name: "File list width" });

  await separator.dblclick();

  await expect
    .poll(async () => {
      const end = await textEnd(page, text);
      const after = await box(deleteAll);

      return end <= after.x;
    })
    .toBe(true);
  expect(Number(await separator.getAttribute("aria-valuenow"))).toBeLessThan(280);
});
