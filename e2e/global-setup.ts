import { rmSync } from "node:fs";
import { join } from "node:path";

import type { FullConfig } from "@playwright/test";
import { z } from "zod";

import { gitDirectory, paseoUi } from "./paseo";

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

// A daemon of the tests' own, started fresh for each run, so nothing carries over from an earlier
// run or from checks with the paseo-ui skill. Its home stays after the run, for its logs.
export default async function globalSetup(config: FullConfig): Promise<() => Promise<void>> {
  checkBrowsers(config.version);

  const home = join(gitDirectory, "paseo-e2e");

  process.env["PASEO_UI_HOME"] = home;
  // A run that was killed leaves its daemon running.
  await paseoUi(["stop"]);
  rmSync(home, { recursive: true, force: true });

  const started = await paseoUi(["start"]);

  const { url, server } = z
    .object({ url: z.string(), server: z.string() })
    .parse(/^url: (?<url>.+)\nserver: (?<server>.+)$/u.exec(started)?.groups);

  process.env["PASEO_UI_URL"] = url;
  process.env["PASEO_UI_SERVER"] = server;

  return async () => {
    await paseoUi(["stop"]);
  };
}
