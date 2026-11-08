import type { Page } from "@playwright/test";
import { z } from "zod";

import { commitAll, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { button, line } from "./panel";

// The shared daemon's diffs are in the Auto style, as no test there picks another, which shows them
// side by side in a window this wide.
test.use({ viewport: { width: 2048, height: 720 } });

// How many elements an XPath expression found, and where the first of them was.
const found = z.object({ count: z.number(), left: z.number(), top: z.number() });

// What a frame the page drew showed of the elements some XPath expressions find.
type Frame = z.infer<typeof found>[];

// Notes what each frame the page draws from now on, while the panel shows, shows of the elements
// the XPath expressions find. A string, since the tests typecheck without the DOM library.
async function noteFrames(page: Page, expressions: readonly string[]): Promise<void> {
  await page.evaluate(`(() => {
    const separator = document.querySelector('[aria-label="File list width"]');
    window.noted = [];
    function note() {
      if (separator.getBoundingClientRect().width > 0) {
        window.noted.push(${JSON.stringify(expressions)}.map((expression) => {
          const elements = document.evaluate(expression, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          const { left, top } = elements.snapshotItem(0)?.getBoundingClientRect() ?? { left: 0, top: 0 };
          return { count: elements.snapshotLength, left, top };
        }));
      }
      requestAnimationFrame(note);
    }
    requestAnimationFrame(note);
  })()`);
}

async function notedFrames(page: Page): Promise<Frame[]> {
  return z.array(z.array(found)).parse(await page.evaluate("window.noted"));
}

async function twoFrames(page: Page): Promise<void> {
  await page.evaluate(
    "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
  );
}

// Shows a new agent's tab in place of the panel's, as switching to an agent's chat does, and then
// the panel's tab again, and gives the frames noted before and after.
async function switchingBack(page: Page): Promise<{ before: Frame[]; after: Frame[] }> {
  await twoFrames(page);
  await button(page, "New tab").click();
  await page.getByRole("menuitem", { name: /^Agent\b/u }).click();
  await expect(page.getByRole("textbox", { name: "Message agent..." })).toBeVisible();
  await twoFrames(page);

  const before = await notedFrames(page);

  await button(page, "Better Diff").click();
  await expect(page.getByRole("separator", { name: "File list width" })).toBeVisible();
  await twoFrames(page);

  const noted = await notedFrames(page);

  return { before, after: noted.slice(before.length) };
}

test("switching back to the panel's tab from another shows it as it was at once", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a kept\na old\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "a kept\na new\n");

  await app.openPanel();
  await expect(line(page, "a kept")).toHaveCount(2);
  await noteFrames(page, ['//*[@aria-label="File list width"]', '//*[text()="a kept"]']);

  const { before, after } = await switchingBack(page);

  expect(after).not.toHaveLength(0);
  expect(after).toStrictEqual(after.map(() => before.at(-1)));
});

test("switching back to the panel's tab from another shows a group's hunk bar under its file bar at once", async ({
  app,
  page,
  repository,
}) => {
  writeFile(
    repository,
    "a.txt",
    Array.from({ length: 60 }, (_, index) => `a ${index + 1}\n`).join(""),
  );

  await app.openPanel();
  await button(page, "UNTRACKED FILES (1)").click();
  await line(page, "a 40").scrollIntoViewIfNeeded();
  await expect(line(page, "a 1")).not.toBeInViewport();
  await noteFrames(page, [
    '//*[@role="heading"][starts-with(@aria-label, "UNTRACKED a.txt")]',
    '//*[@aria-label="Hunk 1 of a.txt"]',
  ]);

  const { before, after } = await switchingBack(page);

  expect(after).not.toHaveLength(0);
  expect(after).toStrictEqual(after.map(() => before.at(-1)));
});
