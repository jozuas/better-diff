import type { Locator, Page } from "@playwright/test";
import { z } from "zod";

import { commitAll, runGit, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { button, group, openFile, row } from "./panel";

// Commits `a.txt` and `b.txt`, then changes both.
function changeTwo(repository: string): void {
  writeFile(repository, "a.txt", "a\n");
  writeFile(repository, "b.txt", "b\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "changed a\n");
  writeFile(repository, "b.txt", "changed b\n");
}

function status(repository: string): string {
  return runGit(repository, ["status", "--porcelain", "--untracked-files=all"]);
}

// Reads how the element looks on the page, as a screenshot's bytes in base64, each time it's called.
function looksOf(locator: Locator): () => Promise<string> {
  return async () => {
    const screenshot = await locator.screenshot();

    return screenshot.toString("base64");
  };
}

// Reads the CSS property's value for the first element the selector finds, as the page computes it,
// each time it's called. A string, since the tests typecheck without the DOM library.
function computedOf(page: Page, selector: string, property: string): () => Promise<string> {
  const element = `document.querySelector(${JSON.stringify(selector)})`;

  return async () =>
    z
      .string()
      .parse(
        await page.evaluate(
          `getComputedStyle(${element}).getPropertyValue(${JSON.stringify(property)})`,
        ),
      );
}

test("a button is tinted while the pointer is over it, and more while it's pressed, and a sidebar button's icon brightens too", async ({
  app,
  page,
  repository,
}) => {
  changeTwo(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");
  await row(page, "MODIFIED FILES (2)", "b.txt").hover();
  const icon = button(page, "Stage b.txt");
  const iconLooks = looksOf(icon);

  await expect(icon).toHaveCSS("opacity", "1");
  const revealed = await iconLooks();

  await icon.hover();
  await expect.poll(iconLooks).not.toBe(revealed);

  const stage = button(page, "Stage");
  const stageLooks = looksOf(stage);
  const plain = await stageLooks();

  await stage.hover();
  await expect.poll(stageLooks).not.toBe(plain);

  const hovered = await stageLooks();

  await page.mouse.down();
  await expect.poll(stageLooks).not.toBe(hovered);
  await page.mouse.up();

  await expect(group(page, "STAGED FILES (1)")).toHaveText(["a.txt"]);
  expect(status(repository)).toBe("M  a.txt\n M b.txt\n");
});

test("a button that asks for confirmation shows the danger colour while the pointer is over it", async ({
  app,
  page,
  repository,
}) => {
  changeTwo(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");
  await expect(button(page, "Discard")).toBeVisible();
  const label = computedOf(page, '[aria-label="Discard"] [dir="auto"]', "color");
  const plain = await label();

  await button(page, "Discard").hover();
  await expect.poll(label).not.toBe(plain);

  const warning = await label();

  await row(page, "MODIFIED FILES (2)", "b.txt").hover();
  await button(page, "Discard b.txt").hover();
  await expect.poll(computedOf(page, '[aria-label="Discard b.txt"] svg', "stroke")).toBe(warning);
  await button(page, "Discard b.txt").click();

  await expect(button(page, "Confirm discard?")).toBeVisible();
  expect(await computedOf(page, '[aria-label="Confirm discard?"]', "background-color")()).toBe(
    warning,
  );
});

test("a group's triangle and heading brighten while the pointer is over them", async ({
  app,
  page,
  repository,
}) => {
  changeTwo(repository);

  await app.openPanel();
  const triangle = button(page, "MODIFIED FILES");
  const heading = button(page, "MODIFIED FILES (2)");
  const triangleLooks = looksOf(triangle);
  const headingLooks = looksOf(heading);

  // The pointer over either shows the heading's actions, so each is compared with how it looks while
  // the pointer is over the other.
  await heading.hover();
  await expect(button(page, "Stage All")).toHaveCSS("opacity", "1");
  const triangleRevealed = await triangleLooks();

  await triangle.hover();
  await expect.poll(triangleLooks).not.toBe(triangleRevealed);

  const headingRevealed = await headingLooks();

  await heading.hover();
  await expect.poll(headingLooks).not.toBe(headingRevealed);
});

test("the separator shows its line in the accent colour while the pointer is over it", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a\n");

  await app.openPanel();
  await expect(group(page, "UNTRACKED FILES (1)")).toHaveText(["a.txt"]);
  const separator = page.getByRole("slider", { name: "File list width" });
  const looks = looksOf(separator);
  const plain = await looks();

  await separator.hover();
  await expect.poll(looks).not.toBe(plain);

  await page.mouse.move(0, 0);
  await expect.poll(looks).toBe(plain);
});
