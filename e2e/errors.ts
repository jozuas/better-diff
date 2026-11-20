import type { Page } from "@playwright/test";

// The uncaught exceptions and logged errors in the page from now on.
export function errorsIn(page: Page): string[] {
  const errors: string[] = [];

  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  return errors;
}
