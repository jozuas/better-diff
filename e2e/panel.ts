import type { Locator, Page } from "@playwright/test";

// A group's files in the sidebar, by the group's heading.
export function group(page: Page, heading: string): Locator {
  return page.getByRole("list", { name: heading }).getByRole("button");
}

export async function openFile(page: Page, heading: string, path: string): Promise<void> {
  await group(page, heading)
    .and(page.getByRole("button", { name: path, exact: true }))
    .click();
}

export function line(page: Page, text: string): Locator {
  return page.getByText(text, { exact: true });
}

export function button(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true });
}
