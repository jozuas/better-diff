import { rmSync } from "node:fs";

import type { FullConfig } from "@playwright/test";

import { addTestAgent, daemons, homeOf, paseoUi, passAddress } from "./paseo";
import type { Daemon } from "./paseo";

// devenv's Chromium is nixpkgs' build for one version of Playwright, and another version looks
// for a different build.
function checkBrowsers(version: string): void {
  const browsers = process.env["PLAYWRIGHT_BROWSERS_VERSION"];

  if (browsers !== undefined && browsers !== version) {
    throw new Error(
      `devenv's Chromium is for Playwright ${browsers}, but @playwright/test is ${version}. Install @playwright/test@${browsers}, or update nixpkgs to one whose playwright-driver is ${version}.`,
    );
  }
}

async function stop(daemon: Daemon): Promise<void> {
  await paseoUi(daemon, ["stop"]);
}

// Starts the daemon fresh, so nothing carries over from an earlier run or from checks with the
// paseo-ui skill, with the test agent's plugin, and passes the tests its address.
async function start(daemon: Daemon): Promise<void> {
  // A run that was killed leaves its daemon running.
  await stop(daemon);
  rmSync(homeOf(daemon), { recursive: true, force: true });
  passAddress(daemon, await paseoUi(daemon, ["start"]));
  await addTestAgent(daemon);
}

// The tests' own daemons, for this run.
export default async function globalSetup(config: FullConfig): Promise<() => Promise<void>> {
  checkBrowsers(config.version);
  // One at a time: each installs the plugin from the checkout, which two at once fail to.
  await start("shared");
  await start("settings");

  return async () => {
    await Promise.all(daemons.map(stop));
  };
}
