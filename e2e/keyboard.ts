import type { Locator, Page } from "@playwright/test";

import { commitAll, runGit, writeFile } from "../test/repository";

export function status(repository: string): string {
  return runGit(repository, ["status", "--porcelain", "--untracked-files=all"]);
}

export function staged(repository: string): string {
  return runGit(repository, ["diff", "--cached"]);
}

function numbered(name: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${name} ${index + 1}`);
}

// Commits `a.txt` as lines 1 to 9, then changes its first and last line, which makes two hunks.
export function changeTwoHunks(repository: string): void {
  writeFile(repository, "a.txt", "1\n2\n3\n4\n5\n6\n7\n8\n9\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "first\n2\n3\n4\n5\n6\n7\n8\nlast\n");
}

// Commits `a.txt` as 100 lines, then adds 40 after line 10 and 40 after line 60, which makes two
// hunks taller than the view. The second's lines start at line 58.
export function changeTwoTallHunks(repository: string): void {
  const lines = numbered("line", 100);

  writeFile(repository, "a.txt", `${lines.join("\n")}\n`);
  commitAll(repository);
  writeFile(
    repository,
    "a.txt",
    `${[
      ...lines.slice(0, 10),
      ...numbered("first", 40),
      ...lines.slice(10, 60),
      ...numbered("second", 40),
      ...lines.slice(60),
    ].join("\n")}\n`,
  );
}

// Writes the file as lines from "<name> 1" to "<name> 60", which makes a diff taller than the view.
export function writeLong(repository: string, path: string, name: string): void {
  writeFile(repository, path, `${numbered(name, 60).join("\n")}\n`);
}

// The bar of the file's hunk, from the first, 1.
export function hunkBar(page: Page, path: string, hunk = 1): Locator {
  return page.getByRole("group", { name: `Hunk ${hunk} of ${path}`, exact: true });
}

// The bar of the file's mode change.
export function modeBar(page: Page, path: string): Locator {
  return page.getByRole("group", { name: `Mode change of ${path}`, exact: true });
}

// A file's bar, by its status and path, as "MODIFIED a.txt", which focus moves to.
export function fileBar(page: Page, name: string): Locator {
  return page.getByRole("group", { name });
}

// A group's heading in the sidebar, by its title and count, as "MODIFIED FILES (2)".
export function heading(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true });
}
