import type { Locator } from "@playwright/test";

import { expect, test } from "./fixtures";
import { hunkBar } from "./keyboard";
import { changeLines } from "./numbered";
import { box, button, line, openFile } from "./panel";

// An element on the page, which the tests typecheck without the DOM library to describe.
interface Styled {
  parentElement: Styled | null;
  ownerDocument: {
    defaultView: { getComputedStyle: (element: Styled) => { backgroundColor: string } };
  };
}

// The element's background colour, and that of what's behind it: of the nearest element it's in
// with a colour of its own.
async function backgroundsOf(locator: Locator): Promise<{ own: string; behind: string }> {
  const colors = await locator.evaluate((element: Styled) => {
    function colorOf(styled: Styled): string {
      return element.ownerDocument.defaultView.getComputedStyle(styled).backgroundColor;
    }

    let behind = element.parentElement;

    while (behind !== null && colorOf(behind) === "rgba(0, 0, 0, 0)") {
      behind = behind.parentElement;
    }

    return { own: colorOf(element), behind: behind === null ? "" : colorOf(behind) };
  });

  return colors;
}

test("a hunk's bar is in the diff's own background, with a thin line across its middle, rather than in a colour of its own", async ({
  app,
  page,
  repository,
}) => {
  changeLines(repository, [100]);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await expect(line(page, "a 100 changed")).toBeVisible();

  const bar = hunkBar(page, "a.txt");
  const { own, behind } = await backgroundsOf(bar);

  expect(own).toBe(behind);
  await expect(bar).toHaveCSS("border-top-width", "0px");
  await expect(bar).toHaveCSS("border-bottom-width", "0px");

  const shown = await box(bar);
  const across = await box(bar.getByRole("separator"));

  expect(across.height).toBe(1);
  expect(across.x).toBe(shown.x);
  expect(across.width).toBe(shown.width);
  expect(Math.abs(across.y - (shown.y + shown.height / 2))).toBeLessThanOrEqual(1);
});

test("the first hunk's bar has no line where the hunk starts the file, as only the file's bar is above it", async ({
  app,
  page,
  repository,
}) => {
  changeLines(repository, [1, 100]);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await expect(line(page, "a 1 changed")).toBeVisible();

  await expect(hunkBar(page, "a.txt", 1).getByRole("separator")).toHaveCount(0);
  await expect(hunkBar(page, "a.txt", 2).getByRole("separator")).toHaveCount(1);

  await line(page, "a 1 changed").hover();
  await button(page, "Show entire file").first().click();

  await expect(line(page, "a 10")).toBeVisible();
  await expect(hunkBar(page, "a.txt", 1).getByRole("separator")).toHaveCount(0);
  await expect(hunkBar(page, "a.txt", 2).getByRole("separator")).toHaveCount(1);
});
