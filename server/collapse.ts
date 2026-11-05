import { posix } from "node:path";

import { git } from "./git";
import type { UnhighlightedDiff } from "./highlight";

// What package managers write, by name, which GitHub collapses too.
const lockfiles = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "deno.lock",
  "Cargo.lock",
  "Gemfile.lock",
  "composer.lock",
  "poetry.lock",
  "Pipfile.lock",
  "uv.lock",
  "go.sum",
  "mix.lock",
  "flake.lock",
  "devenv.lock",
  "pubspec.lock",
  "Podfile.lock",
  "Package.resolved",
]);

// A diff that adds and removes more lines than this, together, is large.
const largeDiff = 1000;

// Whether the file at the path is generated, by its linguist-generated attribute's value as git
// check-attr prints it: as for GitHub, it is where the attribute is set, to anything but false.
// Where the attribute isn't specified, a lockfile is.
function isGenerated(path: string, value: string | undefined): boolean {
  if (value === "unspecified") {
    return lockfiles.has(posix.basename(path));
  }

  return value !== "unset" && value !== "false";
}

// The paths whose files are generated. git check-attr reads them all from its input, and prints
// each one's path, attribute and value in turn.
export async function generatedPaths(
  directory: string,
  paths: readonly string[],
): Promise<Set<string>> {
  const output = await git(directory, "check-attr", ["--stdin", "linguist-generated"], [], {
    input: Buffer.from(paths.map((path) => `${path}\0`).join("")),
  });

  const fields = output.toString().split("\0");

  return new Set(paths.filter((path, index) => isGenerated(path, fields[3 * index + 2])));
}

// The diff without its hunks and contents, where it has some and the file is generated or the diff
// large: thousands of lines are slow to show, and a generated file's are seldom read.
export function collapsed<D extends UnhighlightedDiff>(diff: D, generated: boolean): D {
  const large = diff.added + diff.removed > largeDiff;

  if (diff.hunks.length === 0 || !(generated || large)) {
    return diff;
  }

  return {
    ...diff,
    collapsed: generated ? "generated" : "large",
    hunks: [],
    contents: {
      // Stryker disable next-line ArrayDeclaration: with no hunks, no line of the old version shows.
      old: [],
      new: [],
    },
  };
}
