import { writeFileSync } from "node:fs";

import type { Page } from "@playwright/test";
import { expect, test as base } from "@playwright/test";
import { z } from "zod";

import { inRepository } from "../test/repository";
import { paseoUi, pluginId, setting } from "./paseo";

interface App {
  // One of the plugin's screens.
  openScreen: (id: string) => Promise<void>;
}

// pageErrors and pluginLogs check each test, and give it nothing.
interface Fixtures extends Record<"pageErrors" | "pluginLogs", void> {
  // A git repository in a temporary directory, removed after the test.
  repository: string;
  // The ID of repository's workspace, which the page shows. Archived after the test, before
  // repository is removed, so the daemon isn't left watching a directory that's gone.
  workspace: string;
  app: App;
}

async function show(page: Page, path: string): Promise<void> {
  // A fresh browser sent straight to a deep link lands on /open-project.
  await page.goto("/");
  await page.goto(`/h/${setting("PASEO_UI_SERVER")}/${path}`);
}

export const test = base.extend<Fixtures>({
  baseURL: async ({}, provide) => {
    await provide(setting("PASEO_UI_URL"));
  },

  repository: async ({}, provide) => {
    await inRepository(provide);
  },

  workspace: async ({ page, repository }, provide) => {
    const created = await paseoUi([
      "paseo",
      "workspace",
      "create",
      "--isolation",
      "local",
      "--path",
      repository,
      "--json",
    ]);

    const { workspaceId } = z.object({ workspaceId: z.string() }).parse(JSON.parse(created));

    try {
      await show(page, `workspace/${workspaceId}`);
      await provide(workspaceId);
    } finally {
      await paseoUi(["paseo", "workspace", "archive", workspaceId]);
    }
  },

  app: async ({ page }, provide) => {
    await provide({
      openScreen: async (id) => {
        await show(page, `plugin/${pluginId}/surface/${id}`);
      },
    });
  },

  // What the plugin's server printed, attached to a failed test. Set up before pageErrors, so it's
  // torn down after it, and sees the failure pageErrors reports.
  pluginLogs: [
    async ({}, provide, testInfo) => {
      await provide();

      if (testInfo.status !== testInfo.expectedStatus) {
        // A file, since the report cuts text attachments short.
        const path = testInfo.outputPath("plugin-logs.txt");

        writeFileSync(path, await paseoUi(["paseo", "plugin", "logs", pluginId]));
        await testInfo.attach("plugin logs", { path, contentType: "text/plain" });
      }
    },
    { auto: true },
  ],

  // An uncaught exception or a logged error fails the test, even if the screen looks right.
  pageErrors: [
    async ({ page }, provide) => {
      const errors: string[] = [];

      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(message.text());
        }
      });

      await provide();
      expect(errors, "errors in the page").toStrictEqual([]);
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
