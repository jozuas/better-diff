import { once } from "node:events";

import { spawnProcess } from "@getpaseo/plugin/server";

// Options without which the user's config could change output the plugin parses.
const commandOptions = {
  // Paths NUL-terminated and never quoted.
  status: ["-z"],
  // Git's own patch, which `git apply` takes back: not an external tool's or a textconv filter's,
  // without colour codes, with the a/ and b/ prefixes whatever diff.noprefix and
  // diff.mnemonicPrefix say, and with the context lines `git apply` needs to place each hunk
  // whatever diff.context says.
  diff: [
    "--no-ext-diff",
    "--no-textconv",
    "--no-color",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    "--unified=3",
  ],
  // The patch as it is, where apply.whitespace would fix or reject lines with trailing whitespace,
  // such as each line of a CRLF file.
  apply: ["--whitespace=nowarn"],
};

// Runs a git command and returns what it prints, as bytes: files, and so diffs, needn't be UTF-8.
// `input` is what the command reads, such as the patch `git apply` applies.
export async function git(
  directory: string,
  command: keyof typeof commandOptions,
  options: readonly string[],
  paths: readonly string[] = [],
  input: Uint8Array = new Uint8Array(),
): Promise<Buffer> {
  const child = spawnProcess(
    "git",
    [
      "-c",
      "core.quotePath=false",
      // An empty unchanged line in a diff keeps its leading space.
      "-c",
      "diff.suppressBlankEmpty=false",
      // A path names a file, never a pattern such as `*` or `:!x`.
      "--literal-pathspecs",
      // Reading doesn't refresh the index, so it never holds the index lock while an agent's own
      // git command needs it.
      "--no-optional-locks",
      command,
      ...commandOptions[command],
      ...options,
      "--",
      ...paths,
    ],
    // Stryker disable next-line StringLiteral: spawn pipes the streams anyway. "pipe" picks the overload whose type says so.
    { cwd: directory, stdio: "pipe" },
  );

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  child.stdout.on("data", (chunk: Buffer) => {
    stdout.push(chunk);
  });

  child.stderr.on("data", (chunk: Buffer) => {
    stderr.push(chunk);
  });

  // A command that fails before reading all its input closes it, and its exit code says it failed.
  child.stdin.on("error", () => {});
  child.stdin.end(input);
  await once(child, "close");

  if (child.exitCode !== 0) {
    throw new Error(`git ${command} failed: ${Buffer.concat(stderr).toString()}`);
  }

  return Buffer.concat(stdout);
}
