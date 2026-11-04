import type { Page } from "@playwright/test";

import { commitAll, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { openFile } from "./panel";

// An element on the page, which the tests typecheck without the DOM library to describe.
interface Styled {
  textContent: string | null;
  ownerDocument: {
    defaultView: {
      getComputedStyle: (element: Styled) => { color: string; backgroundColor: string };
    };
  };
}

interface Highlights {
  removed: string;
  added: string;
}

// The highlights of removed and added lines' changed words: the colours of the file bar's counts of
// the lines its diff removes and adds, Paseo's red and green, at 30% opacity, over the lines' tints.
async function highlightsOf(page: Page, heading: string): Promise<Highlights> {
  async function colorOf(count: RegExp): Promise<string> {
    const color = await page
      .getByRole("heading", { name: heading })
      .getByText(count)
      .evaluate(
        (element: Styled) => element.ownerDocument.defaultView.getComputedStyle(element).color,
      );

    return color.replace(/^rgb\((?<channels>.*)\)$/u, "rgba($<channels>, 0.3)");
  }

  return { removed: await colorOf(/^−\d+$/u), added: await colorOf(/^\+\d+$/u) };
}

// The texts the page highlights in the colour, in the order it shows them.
function highlightedIn(page: Page, color: string): () => Promise<(string | null)[]> {
  return async () => {
    const texts = await page
      .locator("span")
      .evaluateAll(
        (elements: Styled[], wanted: string) =>
          elements.flatMap((element) =>
            element.ownerDocument.defaultView.getComputedStyle(element).backgroundColor === wanted
              ? [element.textContent]
              : [],
          ),
        color,
      );

    return texts;
  };
}

// Expects the page to highlight exactly the texts, in removed lines and in added ones.
async function expectHighlighted(
  page: Page,
  heading: string,
  removed: string[],
  added: string[],
): Promise<void> {
  const highlights = await highlightsOf(page, heading);

  expect(highlights.removed).not.toBe(highlights.added);
  await expect.poll(highlightedIn(page, highlights.removed)).toStrictEqual(removed);
  await expect.poll(highlightedIn(page, highlights.added)).toStrictEqual(added);
}

test("changed words within a line are highlighted, as in Sublime Merge, in a stronger tint of the line's red or green", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.ts", 'export const label = "Total price";\n');
  commitAll(repository);
  writeFile(repository, "a.ts", 'export const label = "Total cost";\n');

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.ts");

  await expectHighlighted(page, "MODIFIED a.ts +1 −1", ["price"], ["cost"]);
});

test("a line split in two shows only what changed where it's split", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "call(first, second);\nend\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "call(first,\n  second);\nend\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expectHighlighted(page, "MODIFIED a.txt +2 −1", [" "], ["  "]);
});

test("an unchanged stretch with at least as much text both removed and added on each side of it in its line counts as changed, as a space between two replaced words does", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "x: foo = bar\nkeep\ny: a = b\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "x: baz = qux\nkeep\ny: c = d\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expectHighlighted(
    page,
    "MODIFIED a.txt +2 −2",
    ["foo = bar", "a", "b"],
    ["baz = qux", "c", "d"],
  );
});

test("a line that keeps nothing but whitespace, as one rewritten or added does, has no words highlighted", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "  a = 41\n  foo bar\nend\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "  a = 42\n  baz qux\n  added\nend\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expectHighlighted(page, "MODIFIED a.txt +3 −2", ["41"], ["42"]);
});

test("nor has a run that would take more than 1,000 words and line breaks removed and added to compare", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", `x = 1\nkeep\nkept ${"a ".repeat(600)}end\n`);
  commitAll(repository);
  writeFile(repository, "a.txt", `x = 2\nkeep\nkept ${"b ".repeat(600)}end\n`);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expectHighlighted(page, "MODIFIED a.txt +2 −2", ["1"], ["2"]);
});
