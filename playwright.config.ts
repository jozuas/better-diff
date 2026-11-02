import { defineConfig } from "@playwright/test";

import { isolateGit } from "./test/environment";

// Before e2e/global-setup.ts starts the tests' Paseo daemon, which runs the plugin's git.
isolateGit();

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "reports/e2e",
  fullyParallel: true,
  forbidOnly: true,
  reporter: "list",
  use: {
    // Playwright's default, too narrow for the Auto style to show a diff side by side.
    viewport: { width: 1280, height: 720 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
