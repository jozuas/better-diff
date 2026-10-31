import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

function git(args: readonly string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

const root = git(["rev-parse", "--show-toplevel"]);

export const gitDirectory = git(["rev-parse", "--absolute-git-dir"]);

export const pluginId = z
  .object({ id: z.string() })
  .parse(JSON.parse(readFileSync(join(root, "paseo-plugin.json"), "utf8"))).id;

// Runs the paseo-ui skill's script, against the daemon in PASEO_UI_HOME.
export function paseoUi(args: readonly string[]): string {
  return execFileSync(join(root, ".claude/skills/paseo-ui/paseo-ui.sh"), args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    // Playwright forces colour in its workers, which would put escape codes in what paseo prints.
    env: { ...process.env, FORCE_COLOR: "0" },
  });
}

// What e2e/global-setup.ts passes the tests.
export function setting(name: "PASEO_UI_URL" | "PASEO_UI_SERVER"): string {
  return z.string().parse(process.env[name]);
}
