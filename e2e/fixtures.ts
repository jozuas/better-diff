import { writeFileSync } from "node:fs";

import { expect, test as base } from "@playwright/test";
import { z } from "zod";

import { inRepository } from "../test/repository";
import { paseoUi, pluginId, setting } from "./paseo";

interface App {
  // One of the plugin's screens.
  openScreen: (id: string) => Promise<void>;
  // Opens a directory as a workspace, shows it and returns its ID.
  openWorkspace: (directory: string) => Promise<string>;
}

// pageErrors and pluginLogs check each test, and give it nothing.
interface Fixtures extends Record<"pageErrors" | "pluginLogs", void> {
  // A git repository in a temporary directory, removed after the test.
  repository: string;
  app: App;
}

export const test = base.extend<Fixtures>({
  baseURL: async ({}, provide) => {
    await provide(setting("PASEO_UI_URL"));
  },

  repository: async ({}, provide) => {
    await inRepository(provide);
  },

  app: async ({ page }, provide) => {
    async function open(path: string): Promise<void> {
      // A fresh browser sent straight to a deep link lands on /open-project.
      await page.goto("/");
      await page.goto(`/h/${setting("PASEO_UI_SERVER")}/${path}`);
    }

    await provide({
      openScreen: async (id) => {
        await open(`plugin/${pluginId}/surface/${id}`);
      },
      openWorkspace: async (directory) => {
        const created = paseoUi([
          "paseo",
          "workspace",
          "create",
          "--isolation",
          "local",
          "--path",
          directory,
          "--json",
        ]);

        const { workspaceId } = z.object({ workspaceId: z.string() }).parse(JSON.parse(created));

        await open(`workspace/${workspaceId}`);

        return workspaceId;
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

        writeFileSync(path, paseoUi(["paseo", "plugin", "logs", pluginId]));
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
