// Runs Stryker on the lines changed since the branch left origin/main, committed or not, and on new
// files. Stryker only tests a mutant that lies wholly inside those lines, and a changed test can let
// a mutant elsewhere survive, so the full run in CI still has the last word.
import { execFileSync, spawnSync } from "node:child_process";
import { matchesGlob } from "node:path";

import config from "../stryker.config.mts";

function git(...args: string[]): string {
  return execFileSync("git", ["--literal-pathspecs", ...args], { encoding: "utf8" });
}

// As in Stryker, the last pattern that matches a file decides, and a "!" pattern unmarks it.
function mutated(file: string): boolean {
  const pattern = config.mutate.findLast((glob) => matchesGlob(file, glob.replace(/^!/u, "")));

  return pattern !== undefined && !pattern.startsWith("!");
}

function mutatedFiles(list: string): string[] {
  return list.split("\0").filter((file) => file !== "" && mutated(file));
}

function changedLines(base: string, file: string): string[] {
  const diff = git("diff", "--unified=0", "--no-ext-diff", "--no-color", base, "--", file);

  return [...diff.matchAll(/^@@ -\S+ \+(?<start>\d+)(?:,(?<count>\d+))? @@/gmu)].flatMap(
    ({ groups }) => {
      const first = Number(groups?.["start"]);
      const lines = Number(groups?.["count"] ?? 1);

      return lines === 0 ? [] : [`${file}:${first}-${first + lines - 1}`];
    },
  );
}

const base = git("merge-base", "origin/main", "HEAD").trim();

const mutate = [
  ...mutatedFiles(git("diff", "--name-only", "-z", "--diff-filter=d", base)).flatMap((file) =>
    changedLines(base, file),
  ),
  ...mutatedFiles(git("ls-files", "-z", "--others", "--exclude-standard")),
];

if (mutate.length === 0) {
  process.stdout.write(
    "Nothing to mutate: no line Stryker mutates has changed since origin/main.\n",
  );
} else {
  const stryker = spawnSync(
    "stryker",
    ["run", "stryker.config.mts", "--mutate", mutate.join(","), ...process.argv.slice(2)],
    { stdio: "inherit" },
  );

  process.exitCode = stryker.status ?? 1;
}
