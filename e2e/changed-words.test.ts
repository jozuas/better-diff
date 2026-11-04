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

test("changed words within a line are highlighted, as in Sublime Merge, in a stronger tint of the line's red or green, as delta highlights them", async ({
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

test("each removed line in turn is paired with the first added line, after the last one paired, that's similar enough to it, and only paired lines have words highlighted", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "first = 1;\nrewritten(items);\nsecond = 2;\nend\n");
  commitAll(repository);
  writeFile(
    repository,
    "a.txt",
    "first = 10;\nsomething_else = await fetch(config);\nsecond = 20;\nend\n",
  );

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expectHighlighted(page, "MODIFIED a.txt +3 −3", ["1", "2"], ["10", "20"]);
});

test("whitespace both lines keep right after text both changed counts as changed too", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "so it is safe to read the commit number from any one of them.\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "so it is safe to read build info from any one of them.\n");

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expectHighlighted(page, "MODIFIED a.txt +1 −1", ["the commit number"], ["build info"]);
});

// A line of the first word, then the other as many times more as make 400 words.
function wordsLine(first: string, other: string): string {
  return [first, ...Array.from({ length: 399 }, () => other)].join(" ");
}

test("a run stops pairing its lines once the tables aligning them would have more than a million cells together", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", `x = 1\nkeep\n${wordsLine("c", "c")}\n${wordsLine("a", "a")}\n`);
  commitAll(repository);
  writeFile(repository, "a.txt", `x = 2\nkeep\n${wordsLine("b", "a")}\n`);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");

  await expectHighlighted(page, "MODIFIED a.txt +2 −3", ["1"], ["2"]);
});
