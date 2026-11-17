import type { Locator, Page } from "@playwright/test";

import { commitAll, writeFile } from "../test/repository";
import { hunkBar } from "./keyboard";

const lines = Array.from({ length: 200 }, (_, index) => `a ${index + 1}`);

// Writes `a.txt` as lines "a 1" to "a 200", but for those with the numbers, each "a <number>
// changed".
export function writeChanged(repository: string, numbers: readonly number[]): void {
  const changed = lines.map((text, index) =>
    numbers.includes(index + 1) ? `${text} changed` : text,
  );

  writeFile(repository, "a.txt", `${changed.join("\n")}\n`);
}

// Commits `a.txt` as lines "a 1" to "a 200", then changes those with the numbers, as writeChanged
// does.
export function changeLines(repository: string, numbers: readonly number[]): void {
  writeChanged(repository, []);
  commitAll(repository);
  writeChanged(repository, numbers);
}

// The count on a hunk's bar of the unchanged lines left out before it.
export function countOn(page: Page, hunk: number, count: number): Locator {
  return hunkBar(page, "a.txt", hunk).getByRole("button", {
    name: `${String(count)} unchanged lines`,
    exact: true,
  });
}

// The bar at the end of the file's diff, after its last hunk.
export function endBar(page: Page, path = "a.txt"): Locator {
  return page.getByRole("group", { name: `End of ${path}`, exact: true });
}

// The count on the bar at the end of the diff of the unchanged lines left out after the last hunk.
export function countAtEnd(page: Page, count: number): Locator {
  return endBar(page).getByRole("button", {
    name: `${String(count)} unchanged lines`,
    exact: true,
  });
}

// What hides the unchanged lines after the last hunk again, on the bar at the end of the diff.
export function hideAtEnd(page: Page, count: number): Locator {
  return endBar(page).getByRole("button", {
    name: `Hide ${String(count)} unchanged lines`,
    exact: true,
  });
}

// Every count of unchanged lines left out, on the hunks' bars and the bar at the end of the diff.
export function counts(page: Page): Locator {
  return page.getByRole("button", { name: /^\d+ unchanged lines?$/u });
}
