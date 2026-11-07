import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

function git(args: readonly string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

const root = git(["rev-parse", "--show-toplevel"]);

const gitDirectory = git(["rev-parse", "--absolute-git-dir"]);

export const pluginId = z
  .object({ id: z.string() })
  .parse(JSON.parse(readFileSync(join(root, "paseo-plugin.json"), "utf8"))).id;

// The tests' daemons: one most tests share, and one for tests that change the plugin's settings.
// Every tab on a daemon shares its settings, so those tests take turns on a daemon of their own,
// where they can't change what the others show.
export type Daemon = "shared" | "settings";

export const daemons: readonly Daemon[] = ["shared", "settings"];

// Where the daemon keeps its state, which stays after a run, for its logs.
export function homeOf(daemon: Daemon): string {
  return join(gitDirectory, daemon === "shared" ? "paseo-e2e" : "paseo-e2e-settings");
}

// Runs the paseo-ui skill's script, against the daemon. Asynchronously, so a test's timeout can
// stop a test waiting on it, and killed after a minute, since nothing stops global setup waiting on
// a daemon that doesn't answer.
export async function paseoUi(daemon: Daemon, args: readonly string[]): Promise<string> {
  const output = await new Promise<string>((resolve, reject) => {
    const child = execFile(
      join(root, ".claude/skills/paseo-ui/paseo-ui.sh"),
      args,
      {
        encoding: "utf8",
        timeout: 60_000,
        // Playwright forces colour in its workers, which would put escape codes in what paseo prints.
        env: { ...process.env, PASEO_UI_HOME: homeOf(daemon), FORCE_COLOR: "0" },
      },
      (error, stdout) => {
        if (error === null) {
          resolve(stdout);
        } else {
          const reason = child.killed
            ? `paseo-ui.sh ${args.join(" ")} didn't finish in a minute`
            : error.message;

          reject(new Error(reason, { cause: error }));
        }
      },
    );

    child.stdin?.end();
  });

  return output.trim();
}

const address = z.object({ url: z.string(), server: z.string() });

// Where a daemon serves Paseo's web UI, and its server ID.
type Address = z.infer<typeof address>;

function variableOf(daemon: Daemon): string {
  return `PASEO_E2E_${daemon.toUpperCase()}`;
}

// Passes the tests the daemon's address, from what paseo-ui.sh start printed in
// e2e/global-setup.ts.
export function passAddress(daemon: Daemon, started: string): void {
  const passed = address.parse(/^url: (?<url>.+)\nserver: (?<server>.+)$/u.exec(started)?.groups);

  process.env[variableOf(daemon)] = JSON.stringify(passed);
}

export function addressOf(daemon: Daemon): Address {
  return address.parse(JSON.parse(z.string().parse(process.env[variableOf(daemon)])));
}

// The plugin whose provider's agents the tests send review comments to, and that provider.
export const testAgent = "better-diff-test-agent";

const providers = z.array(z.object({ provider: z.string(), status: z.string() }));

async function testAgentAvailable(daemon: Daemon): Promise<boolean> {
  const listed = await paseoUi(daemon, ["paseo", "provider", "ls", "--json"]);

  return providers
    .parse(JSON.parse(listed))
    .some(({ provider, status }) => provider === testAgent && status === "available");
}

// Waits, up to `tries` half seconds, for the test agent's provider to be available, as it is once
// its plugin has loaded.
async function untilAvailable(daemon: Daemon, tries: number): Promise<void> {
  if (await testAgentAvailable(daemon)) {
    return;
  }

  if (tries === 0) {
    throw new Error("The test agent's provider didn't become available.");
  }

  await new Promise((resolve) => {
    setTimeout(resolve, 500);
  });
  await untilAvailable(daemon, tries - 1);
}

// Installs the plugin of the agents that note what they're sent, e2e/agent, on the daemon.
export async function addTestAgent(daemon: Daemon): Promise<void> {
  await paseoUi(daemon, ["paseo", "plugin", "add", join(root, "e2e", "agent"), "--id", testAgent]);
  await untilAvailable(daemon, 60);
}
