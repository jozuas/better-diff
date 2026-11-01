import { execFile, execFileSync } from "node:child_process";
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

// Runs the paseo-ui skill's script, against the daemon in PASEO_UI_HOME. Asynchronously, so a
// test's timeout can stop a test waiting on it, and killed after a minute, since nothing stops
// global setup waiting on a daemon that doesn't answer.
export async function paseoUi(args: readonly string[]): Promise<string> {
  const output = await new Promise<string>((resolve, reject) => {
    const child = execFile(
      join(root, ".claude/skills/paseo-ui/paseo-ui.sh"),
      args,
      {
        encoding: "utf8",
        timeout: 60_000,
        // Playwright forces colour in its workers, which would put escape codes in what paseo prints.
        env: { ...process.env, FORCE_COLOR: "0" },
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

// What e2e/global-setup.ts passes the tests.
export function setting(name: "PASEO_UI_URL" | "PASEO_UI_SERVER"): string {
  return z.string().parse(process.env[name]);
}
