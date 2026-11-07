import type { Locator, Page } from "@playwright/test";

import { commitAll, writeFile } from "../test/repository";
import { expect } from "./fixtures";
import { box, button, line } from "./panel";

// Commits `a.txt`, then changes its third line and adds one at its end, in one hunk.
export function changeA(repository: string): void {
  writeFile(repository, "a.txt", "kept\nalpha\nbravo\ncharlie\n");
  commitAll(repository);
  writeFile(repository, "a.txt", "kept\nalpha\nBRAVO\ncharlie\ndelta\n");
}

// Commits `b.txt` as one line, alongside `a.txt` as changeA does, and then adds one to it.
export function changeAAndB(repository: string): void {
  writeFile(repository, "b.txt", "one\n");
  changeA(repository);
  writeFile(repository, "b.txt", "one\nTWO\n");
}

export function editor(scope: Page | Locator): Locator {
  return scope.getByRole("textbox", { name: "Review comment", exact: true });
}

// Starts a comment on the line, the first with the text, with the button the pointer over it shows.
export async function startComment(page: Page, text: string): Promise<void> {
  await line(page, text).first().hover();
  await button(page, "Add review comment").click();
}

export async function comment(page: Page, text: string, body: string): Promise<void> {
  await startComment(page, text);
  await editor(page).fill(body);
  await button(page, "Save review comment").click();
}

// The pending comment that says the body, under its line or in the review.
export function pending(scope: Page | Locator, body: string): Locator {
  return scope
    .getByRole("group", { name: "Pending review comment", exact: true })
    .filter({ hasText: body });
}

// What Paseo's own diff sends an agent with a review.
export const prompt = { type: "text", text: "Please address this code review." };

export function review(page: Page): Locator {
  return page.getByRole("dialog", { name: "Review", exact: true });
}

// Opens the review from the bar under the diff, whose button says how many comments are pending.
export async function openReview(page: Page, count: number): Promise<Locator> {
  await button(page, `Review (${String(count)})`).click();
  await expect(review(page)).toBeVisible();

  return review(page);
}

export function sendButton(scope: Locator): Locator {
  return scope.getByRole("button", { name: "Send feedback", exact: true });
}

export function messageBox(scope: Locator): Locator {
  return scope.getByRole("textbox", { name: "Message for the agent", exact: true });
}

// Expects the pending comment that says the body to be under the line with the text, and above the
// one with the other.
export async function expectBetween(
  page: Page,
  body: string,
  above: string,
  below: string,
): Promise<void> {
  await expect(pending(page, body)).toBeVisible();

  const over = await box(line(page, above));
  const shown = await box(pending(page, body));
  const under = await box(line(page, below));

  expect(shown.y).toBeGreaterThan(over.y);
  expect(shown.y).toBeLessThan(under.y);
}
