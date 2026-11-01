import type { Locator, Page } from "@playwright/test";

// A group's files' rows in the sidebar, by the group's heading.
export function group(page: Page, heading: string): Locator {
  return page.getByRole("list", { name: heading }).getByRole("listitem");
}

// A file's row in the sidebar, with its actions.
export function row(page: Page, heading: string, path: string): Locator {
  return group(page, heading).filter({
    has: page.getByRole("button", { name: path, exact: true }),
  });
}

export async function openFile(page: Page, heading: string, path: string): Promise<void> {
  await row(page, heading, path).getByRole("button", { name: path, exact: true }).click();
}

export function line(page: Page, text: string): Locator {
  return page.getByText(text, { exact: true });
}

export function button(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true });
}

// Drags across the lines' text, from the start of the first to the end of the last, as selecting
// them does.
export async function selectLines(page: Page, first: string, last = first): Promise<void> {
  const from = await line(page, first).boundingBox();
  const to = await line(page, last).boundingBox();

  if (from === null || to === null) {
    throw new Error(`The lines ${first} and ${last} aren't shown.`);
  }

  await page.mouse.move(from.x + 1, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width - 1, to.y + to.height / 2, { steps: 5 });
  await page.mouse.up();
}

// Drags from the start of the first line's text to the start of the next's, as selecting whole
// lines from their left edge does.
export async function selectUpTo(page: Page, first: string, next: string): Promise<void> {
  const from = await line(page, first).boundingBox();
  const to = await line(page, next).boundingBox();

  if (from === null || to === null) {
    throw new Error(`The lines ${first} and ${next} aren't shown.`);
  }

  await page.mouse.move(from.x + 1, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 1, to.y + to.height / 2, { steps: 5 });
  await page.mouse.up();
}

// Where the element is on the page.
export async function box(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const shown = await locator.boundingBox();

  if (shown === null) {
    throw new Error(`${locator.toString()} isn't shown.`);
  }

  return shown;
}

// Drags from the point, `dx` across the page.
export async function dragFrom(page: Page, x: number, y: number, dx: number): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 5 });
  await page.mouse.up();
}

// Drags the element from its middle, `dx` across the page.
export async function dragBy(page: Page, locator: Locator, dx: number): Promise<void> {
  const { x, y, width, height } = await box(locator);

  await dragFrom(page, x + width / 2, y + height / 2, dx);
}
