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
  // Leaves the plugin's page in Paseo's settings for the list of the host's plugins, within the app,
  // and opens it again from there.
  reopenSettings: () => Promise<void>;
  // Picks the style on the plugin's page in Paseo's settings, whichever an earlier test on the
  // daemon left picked.
  pickDiffStyle: (style: DiffStyle) => Promise<void>;
  // Saves the line length on the plugin's page in Paseo's settings, whichever an earlier test on the
  // daemon left saved.
  saveLineLength: (length: number) => Promise<void>;
  // Switches Hide whitespace on the plugin's page in Paseo's settings, whichever way an earlier test
  // on the daemon left it.
  hideWhitespace: (hidden: boolean) => Promise<void>;
  // Has the page's window regain focus, as switching back to Paseo from another app does.
  focus: () => Promise<void>;
  // Keeps the plugin's waits for changes from reaching the daemon, so the panel finds a change only
  // once an action reads everything again, as in the moment before it finds one. Before openPanel.
  holdWaits: () => Promise<void>;
  // Lets only the first of the plugin's reads of the file's diff reach the daemon, as if those after
  // it never finished, and gives whether the daemon has answered it. Before openPanel.
  readDiffOnce: (path: string) => Promise<() => boolean>;
  // Keeps the plugin's first action from reaching the daemon until the function it gives is called,
  // as if it ran until then, and lets those after it through. Before openPanel.
  holdAction: () => Promise<() => void>;
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

const waitRequest = z.object({
  message: z.object({
    type: z.literal("plugin.rpc.invoke.request"),
    pluginId: z.literal(pluginId),
    method: z.literal("changes.wait"),
  }),
});

const diffReadRequest = z.object({
  message: z.object({
    type: z.literal("plugin.rpc.invoke.request"),
    requestId: z.string(),
    pluginId: z.literal(pluginId),
    method: z.literal("diff.read"),
    input: z.object({ path: z.string() }),
  }),
});

const actionRequest = z.object({
  message: z.object({
    type: z.literal("plugin.rpc.invoke.request"),
    pluginId: z.literal(pluginId),
    method: z.string().startsWith("diff.apply-"),
  }),
});

const rpcResponse = z.object({
  message: z.object({
    type: z.literal("plugin.rpc.invoke.response"),
    payload: z.object({ requestId: z.string() }),
  }),
});

// A message between the page and the daemon, as the schema reads it, if it does. Text that isn't
// JSON doesn't.
function read<Message>(schema: z.ZodType<Message>, message: string | Buffer): Message | undefined {
  const text = z.string().safeParse(message);

  if (!text.success) {
    return undefined;
  }

  try {
    return schema.safeParse(JSON.parse(text.data)).data;
  } catch {
    return undefined;
  }
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
    async function openFromPlugins(): Promise<void> {
      await page.getByRole("button", { name: `Actions for ${pluginId}`, exact: true }).click();
      await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
    }

    async function openSettings(): Promise<void> {
      await show(page, `/settings/hosts/${addressOf(daemon).server}/plugins`);
      await openFromPlugins();
    }

    async function reopenSettings(): Promise<void> {
      await page.getByRole("button", { name: "Back to plugins", exact: true }).click();
      await openFromPlugins();
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
        const lineLength = page.getByRole("textbox", { name: "Line length", exact: true });

        await openSettings();
        await lineLength.fill(String(length));
        // Leaving the page saves the length typed at once, and the page opened again shows it once
        // it's saved.
        await expect(async () => {
          await reopenSettings();
          expect(await lineLength.inputValue()).toBe(String(length));
        }).toPass();
      },
      hideWhitespace: async (hidden) => {
        const hide = page.getByRole("switch", { name: "Hide whitespace", exact: true });

        await openSettings();

        if ((await hide.isChecked()) !== hidden) {
          await hide.click();
        }

        // The switch shows it once it's saved.
        await expect(hide).toBeChecked({ checked: hidden });
      },
      reopenSettings,
      focus: async () => {
        // A string, since the tests typecheck without the DOM library.
        await page.evaluate("window.dispatchEvent(new Event('focus'))");
      },
      holdWaits: async () => {
        await page.routeWebSocket(/./u, (socket) => {
          const server = socket.connectToServer();

          socket.onMessage((message) => {
            if (read(waitRequest, message) === undefined) {
              server.send(message);
            }
          });
        });
      },
      readDiffOnce: async (path) => {
        let first: string | undefined;
        let answered = false;

        await page.routeWebSocket(/./u, (socket) => {
          const server = socket.connectToServer();

          socket.onMessage((message) => {
            const request = read(diffReadRequest, message)?.message;

            if (request?.input.path !== path) {
              server.send(message);
            } else if (first === undefined) {
              first = request.requestId;
              server.send(message);
            }
          });

          server.onMessage((message) => {
            const response = read(rpcResponse, message)?.message;

            answered ||= response !== undefined && response.payload.requestId === first;
            socket.send(message);
          });
        });

        return () => answered;
      },
      holdAction: async () => {
        let release: (() => void) | undefined;

        await page.routeWebSocket(/./u, (socket) => {
          const server = socket.connectToServer();

          socket.onMessage((message) => {
            if (release === undefined && read(actionRequest, message) !== undefined) {
              release = () => {
                server.send(message);
              };
            } else {
              server.send(message);
            }
          });
        });

        return () => {
          release?.();
        };
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
