import { writeFileSync } from "node:fs";

import type { Page } from "@playwright/test";
import { expect, test as base } from "@playwright/test";
import { z } from "zod";

import { inRepository } from "../test/repository";
import { addressOf, paseoUi, pluginId } from "./paseo";
import type { Daemon } from "./paseo";

// The styles diffs can show in, as Better Diff's page in Paseo's settings names them.
type DiffStyle = "Auto" | "Inline" | "Side by side";

interface App {
  // Shows the repository's workspace, and opens the plugin's panel in it.
  openPanel: () => Promise<void>;
  // Opens the plugin's page in Paseo's settings, from its menu in the list of the host's plugins.
  openSettings: () => Promise<void>;
  // Picks the style on the plugin's page in Paseo's settings, whichever an earlier test on the
  // daemon left picked.
  pickDiffStyle: (style: DiffStyle) => Promise<void>;
  // Saves the line length on the plugin's page in Paseo's settings, whichever an earlier test on the
  // daemon left saved.
  saveLineLength: (length: number) => Promise<void>;
  // Has the page's window regain focus, as switching back to Paseo from another app does.
  focus: () => Promise<void>;
}

// pageErrors and pluginLogs check each test, and give it nothing.
interface Fixtures extends Record<"pageErrors" | "pluginLogs", void> {
  // The daemon the test runs against, the shared one unless the test changes the plugin's settings.
  daemon: Daemon;
  // A git repository in a temporary directory, removed after the test.
  repository: string;
  // The ID of repository's workspace. Archived after the test, before repository is removed, so the
  // daemon isn't left watching a directory that's gone.
  workspace: string;
  app: App;
}

async function show(page: Page, path: string): Promise<void> {
  // A fresh browser sent straight to a deep link lands on /open-project, and one sent there before
  // the app has added the daemon to its hosts lands on /welcome. The app leaves / once it has.
  await page.goto("/");
  await page.waitForURL((url) => url.pathname !== "/");
  await page.goto(path);
}

export const test = base.extend<Fixtures>({
  daemon: ["shared", { option: true }],

  baseURL: async ({ daemon }, provide) => {
    await provide(addressOf(daemon).url);
  },

  repository: async ({}, provide) => {
    await inRepository(provide);
  },

  workspace: async ({ daemon, repository }, provide) => {
    const created = await paseoUi(daemon, [
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
      await provide(workspaceId);
    } finally {
      await paseoUi(daemon, ["paseo", "workspace", "archive", workspaceId]);
    }
  },

  app: async ({ daemon, page, workspace }, provide) => {
    async function openSettings(): Promise<void> {
      await show(page, `/settings/hosts/${addressOf(daemon).server}/plugins`);
      await page.getByRole("button", { name: `Actions for ${pluginId}`, exact: true }).click();
      await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
    }

    await provide({
      openPanel: async () => {
        await show(page, `/h/${addressOf(daemon).server}/workspace/${workspace}`);
        await page.getByRole("button", { name: "Better Diff", exact: true }).click();
      },
      openSettings,
      pickDiffStyle: async (style) => {
        await openSettings();
        await page.getByRole("button", { name: /^Diff style: /u }).click();
        await page.getByRole("menuitem", { name: style, exact: true }).click();
        await expect(
          page.getByRole("button", { name: `Diff style: ${style}`, exact: true }),
        ).toBeVisible();
      },
      saveLineLength: async (length) => {
        await openSettings();
        await page.getByRole("textbox", { name: "Line length", exact: true }).fill(String(length));

        const save = page.getByRole("button", { name: "Save", exact: true });

        // Save is disabled while the length typed is the one saved.
        if (await save.isEnabled()) {
          await save.click();
        }

        await expect(save).toBeDisabled();
      },
      focus: async () => {
        // A string, since the tests typecheck without the DOM library.
        await page.evaluate("window.dispatchEvent(new Event('focus'))");
      },
    });
  },

  // What the plugin's server printed, attached to a failed test. Set up before pageErrors, so it's
  // torn down after it, and sees the failure pageErrors reports.
  pluginLogs: [
    async ({ daemon }, provide, testInfo) => {
      await provide();

      if (testInfo.status !== testInfo.expectedStatus) {
        // A file, since the report cuts text attachments short.
        const path = testInfo.outputPath("plugin-logs.txt");

        writeFileSync(path, await paseoUi(daemon, ["paseo", "plugin", "logs", pluginId]));
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

// Has the file's tests run on the daemon of their own for tests that change the plugin's settings,
// one at a time: every tab on a daemon shares them, so they'd change what other tests show.
export function changesSettings(): void {
  test.use({ daemon: "settings" });
  test.describe.configure({ lock: "settings" });
}

export { expect } from "@playwright/test";
