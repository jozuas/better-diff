import { basename } from "node:path";

import { expect, test } from "./fixtures";

test("the greeting screen asks the daemon for a greeting", async ({ app, page }) => {
  await app.openScreen("greeting");
  await page.getByRole("button", { name: "Create greeting" }).click();
  await expect(page.getByText("Hello, Paseo!")).toBeVisible();
});

test("a repository opens as a workspace", async ({ app, page, repository }) => {
  await app.openWorkspace(repository);
  await expect(page.getByRole("button", { name: basename(repository), exact: true })).toBeVisible();
});
