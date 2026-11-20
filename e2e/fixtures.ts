import { writeFileSync } from "node:fs";

import type { Page, TestInfo } from "@playwright/test";
import { expect, test as base } from "@playwright/test";
import { z } from "zod";

import { inRepository } from "../test/repository";
import { agentsOn, sendRequest } from "./agents";
import type { Agents } from "./agents";
import { errorsIn } from "./errors";
import { hold, read } from "./messages";
import type { Held } from "./messages";
import { addressOf, inWorkspace, paseoUi, pluginId } from "./paseo";
import type { Daemon } from "./paseo";

// The styles diffs can show in, as Better Diff's page in Paseo's settings names them.
type DiffStyle = "Auto" | "Inline" | "Side by side";

interface App {
  // Shows the repository's workspace.
  showWorkspace: () => Promise<void>;
  // Shows the repository's workspace, and opens the plugin's panel in it.
  openPanel: () => Promise<void>;
  // Opens the plugin's page in Paseo's settings, from its row in the list of the host's plugins.
  openSettings: () => Promise<void>;
  // Leaves the plugin's page in Paseo's settings for the list of the host's plugins, within the app,
  // and opens it again from there.
  reopenSettings: () => Promise<void>;
  // Picks the style on the plugin's page in Paseo's settings.
  pickDiffStyle: (style: DiffStyle) => Promise<void>;
  // Saves the line length on the plugin's page in Paseo's settings.
  saveLineLength: (length: number) => Promise<void>;
  // Switches Hide whitespace on the plugin's page in Paseo's settings, whichever way an earlier test
  // on the daemon left it.
  hideWhitespace: (hidden: boolean) => Promise<void>;
  // Has the page's window regain focus, as switching back to Paseo from another app does.
  focus: () => Promise<void>;
  // Keeps the plugin's subscriptions to changes from reaching the daemon, so the panel finds a
  // change only once an action reads everything again, as in the moment before it's told of one.
  // Before openPanel.
  holdWatches: () => Promise<void>;
  // Has the daemon close the plugin's first subscription to changes as soon as it's made, as once
  // the plugin's server stops, so that it tells the page of nothing, and gives whether it has.
  // Before openPanel.
  closeFirstWatch: () => Promise<() => boolean>;
  // Lets only the first of the plugin's reads of the file's diff reach the daemon, as if those after
  // it never finished, and gives whether the daemon has answered it. Before openPanel.
  readDiffOnce: (path: string) => Promise<() => boolean>;
  // Keeps the plugin's first action from reaching the daemon until the function it gives is called,
  // as if it ran until then, and lets those after it through. Before openPanel.
  holdAction: () => Promise<() => void>;
  // Keeps the plugin's first listing of the changes from reaching the daemon until the function it
  // gives is called, so the panel lists none until then, whether it asks before or after. Before
  // openPanel.
  holdList: () => Promise<() => void>;
  // Keeps each message the page sends an agent from reaching the daemon until the release it gives
  // is called, as if they were sent until then, and gives how many it's kept. Before openPanel.
  holdSends: () => Promise<Held>;
}

// pageErrors and pluginLogs check each test, and give it nothing.
interface Fixtures extends Record<"pageErrors" | "pluginLogs", void> {
  // The daemon the test runs against, the shared one unless the test changes the settings the host
  // keeps for the plugin.
  daemon: Daemon;
  // A git repository in a temporary directory, removed after the test.
  repository: string;
  // The ID of repository's workspace. Archived after the test, before repository is removed, so the
  // daemon isn't left watching a directory that's gone.
  workspace: string;
  app: App;
  // Paseo in a browser of its own, as on another of the user's devices, which keeps its own device
  // settings: its page, and what opens the plugin's screens in it. Closed after the test.
  otherDevice: { page: Page; app: App };
  agents: Agents;
  // Agents in a workspace of another repository, as those the user has at work elsewhere on the
  // host are. Its workspace is archived after the test, before the repository is removed.
  elsewhere: Agents;
}

const watchRequest = z.object({
  message: z.object({
    type: z.literal("plugin.rpc.subscribe.request"),
    requestId: z.string(),
    pluginId: z.literal(pluginId),
    method: z.literal("changes.watch"),
  }),
});

const subscribeResponse = z.object({
  message: z.object({
    type: z.literal("plugin.rpc.subscribe.response"),
    payload: z.object({ requestId: z.string(), subscriptionId: z.string() }),
  }),
});

const subscriptionEvent = z.object({
  message: z.object({
    type: z.literal("plugin.rpc.event"),
    payload: z.object({ subscriptionId: z.string() }),
  }),
});

// What the daemon tells the page once it has closed the subscription.
function closedMessage(subscriptionId: string): string {
  return JSON.stringify({
    type: "session",
    message: { type: "plugin.rpc.closed", payload: { subscriptionId } },
  });
}

const diffReadRequest = z.object({
  message: z.object({
    type: z.literal("plugin.rpc.invoke.request"),
    requestId: z.string(),
    pluginId: z.literal(pluginId),
    method: z.literal("diff.read"),
    input: z.object({ path: z.string() }),
  }),
});

const listRequest = z.object({
  message: z.object({
    type: z.literal("plugin.rpc.invoke.request"),
    pluginId: z.literal(pluginId),
    method: z.literal("changes.list"),
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

async function show(page: Page, path: string): Promise<void> {
  // A fresh browser sent straight to a deep link lands on /open-project, and one sent there before
  // the app has added the daemon to its hosts lands on /welcome. The app leaves / once it has.
  await page.goto("/");
  await page.waitForURL((url) => url.pathname !== "/");
  await page.goto(path);
}

// The file an agent with the title notes what it's sent in, among the test's output.
function notesIn(testInfo: TestInfo): (title: string) => string {
  return (title) => testInfo.outputPath(`${title}.jsonl`);
}

// What opens the plugin's screens in the page, for the workspace, and holds its messages to the
// daemon back.
function appOn(page: Page, daemon: Daemon, workspace: string): App {
  async function openFromPlugins(): Promise<void> {
    await page.getByRole("button", { name: "Better Diff", exact: true }).click();
  }

  async function openSettings(): Promise<void> {
    await show(page, `/settings/hosts/${addressOf(daemon).server}/plugins`);
    await openFromPlugins();
  }

  async function reopenSettings(): Promise<void> {
    await page.getByRole("button", { name: "Back to plugins", exact: true }).click();
    await openFromPlugins();
  }

  async function showWorkspace(): Promise<void> {
    await show(page, `/h/${addressOf(daemon).server}/workspace/${workspace}`);
  }

  // What holds the first message to the daemon that the schema reads until the function it gives
  // is called, and lets the others through, and once it's called, that one too, if it's yet to
  // be sent.
  function holdingFirst<Message>(schema: z.ZodType<Message>): () => Promise<() => void> {
    return async () => {
      let held: (() => void) | undefined;
      let released = false;

      await page.routeWebSocket(/./u, (socket) => {
        const server = socket.connectToServer();

        socket.onMessage((message) => {
          if (!released && held === undefined && read(schema, message) !== undefined) {
            held = () => {
              server.send(message);
            };
          } else {
            server.send(message);
          }
        });
      });

      return () => {
        released = true;
        held?.();
      };
    };
  }

  return {
    showWorkspace,
    openPanel: async () => {
      await showWorkspace();
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
    holdWatches: async () => {
      await page.routeWebSocket(/./u, (socket) => {
        const server = socket.connectToServer();

        socket.onMessage((message) => {
          if (read(watchRequest, message) === undefined) {
            server.send(message);
          }
        });
      });
    },
    closeFirstWatch: async () => {
      let first: string | undefined;
      let closed: string | undefined;

      await page.routeWebSocket(/./u, (socket) => {
        const server = socket.connectToServer();

        socket.onMessage((message) => {
          first ??= read(watchRequest, message)?.message.requestId;
          server.send(message);
        });

        server.onMessage((message) => {
          const subscribed = read(subscribeResponse, message)?.message.payload;
          const told = read(subscriptionEvent, message)?.message.payload;

          if (told === undefined || told.subscriptionId !== closed) {
            socket.send(message);
          }

          if (subscribed !== undefined && subscribed.requestId === first && closed === undefined) {
            closed = subscribed.subscriptionId;
            socket.send(closedMessage(closed));
          }
        });
      });

      return () => closed !== undefined;
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
    holdAction: holdingFirst(actionRequest),
    holdList: holdingFirst(listRequest),
    holdSends: async () => {
      const held = await hold(page, sendRequest);

      return held;
    },
  };
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
    await inWorkspace(daemon, repository, provide);
  },

  elsewhere: async ({ daemon }, provide, testInfo) => {
    await inRepository(async (other) => {
      await inWorkspace(daemon, other, async (workspace) => {
        await provide(agentsOn(daemon, workspace, notesIn(testInfo)));
      });
    });
  },

  app: async ({ daemon, page, workspace }, provide) => {
    await provide(appOn(page, daemon, workspace));
  },

  otherDevice: async ({ browser, viewport, daemon, workspace }, provide) => {
    const context = await browser.newContext({ baseURL: addressOf(daemon).url, viewport });
    const page = await context.newPage();
    const errors = errorsIn(page);

    await provide({ page, app: appOn(page, daemon, workspace) });
    await context.close();
    expect(errors, "errors in the other device's page").toStrictEqual([]);
  },

  agents: async ({ daemon, workspace }, provide, testInfo) => {
    await provide(agentsOn(daemon, workspace, notesIn(testInfo)));
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

  // An uncaught exception or a logged error fails the test, even if the screen looks right, as it
  // does in the other device's page.
  pageErrors: [
    async ({ page }, provide) => {
      const errors = errorsIn(page);

      await provide();
      expect(errors, "errors in the page").toStrictEqual([]);
    },
    { auto: true },
  ],
});

// Has the file's tests run on the daemon of their own for tests that change the settings the host
// keeps for the plugin, one at a time: every tab on a daemon shares them, so they'd change what
// other tests show. The settings a device keeps need none of it: each test has its own browser.
export function changesSettings(): void {
  test.use({ daemon: "settings" });
  test.describe.configure({ lock: "settings" });
}

// Has the file's tests run, one at a time, on the daemon of their own for tests that change the
// plugin's settings, which no test starts an agent on, so that the host has no agents but those
// the test starts.
export function withoutOtherAgents(): void {
  changesSettings();
}

export { expect } from "@playwright/test";
