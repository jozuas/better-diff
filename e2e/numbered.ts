import type { Locator, Page } from "@playwright/test";

import { commitAll, writeFile } from "../test/repository";
import { hunkBar } from "./keyboard";

// Commits `a.txt` as lines "a 1" to "a 200", then changes those with the numbers, each to
// "a <number> changed".
export function changeLines(repository: string, numbers: readonly number[]): void {
  const lines = Array.from({ length: 200 }, (_, index) => `a ${index + 1}`);

  writeFile(repository, "a.txt", `${lines.join("\n")}\n`);
  commitAll(repository);

  const changed = lines.map((text, index) =>
    numbers.includes(index + 1) ? `${text} changed` : text,
  );

  writeFile(repository, "a.txt", `${changed.join("\n")}\n`);
}

// The count on a hunk's bar of the unchanged lines left out before it.
export function countOn(page: Page, hunk: number, count: number): Locator {
  return hunkBar(page, "a.txt", hunk).getByRole("button", {
    name: `${String(count)} unchanged lines`,
    exact: true,
  });
}

export function counts(page: Page): Locator {
  return page.getByRole("button", { name: /^\d+ unchanged lines?$/u });
}
