import { once } from "node:events";

import { spawnProcess } from "@getpaseo/plugin/server";

// Options without which the user's config could change output the plugin parses, or what a
// command does.
const commandOptions = {
  // Paths NUL-terminated and never quoted.
  status: ["-z"],
  // Git's own patch, which `git apply` takes back: not an external tool's or a textconv filter's,
  // without colour codes, with the a/ and b/ prefixes whatever diff.noprefix and
  // diff.mnemonicPrefix say, and with every line of the file whatever diff.context says: the plugin
  // shows whole files, and works out the hunks with three lines of context from them. A renamed
  // file's two paths make one diff whatever diff.renames says, since git status, which finds the
  // rename, follows status.renames first.
  diff: [
    "--find-renames",
    "--no-ext-diff",
    "--no-textconv",
    "--no-color",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    "--unified=1000000000",
  ],
  // The patch as it is, where apply.whitespace would fix or reject lines with trailing whitespace,
  // such as each line of a CRLF file.
  apply: ["--whitespace=nowarn"],
  add: [],
  "rev-parse": [],
  reset: [],
  restore: [],
  rm: [],
  // Deletes whatever clean.requireForce says.
  clean: ["--force"],
};

// Commands that read their paths from their input: as arguments, as many as a group of files can
// have would be more than a process can start with.
const readsPaths = new Set<keyof typeof commandOptions>(["add", "reset", "restore", "rm"]);

interface Extras {
  // What the command reads, such as the patch `git apply` applies. A command that reads its paths
  // reads them in its place.
  input?: Uint8Array;
  // An index file the command uses in place of the repository's own.
  index?: string | undefined;
}

// Runs a git command and returns what it prints, as bytes: files, and so diffs, needn't be UTF-8.
export async function git(
  directory: string,
  command: keyof typeof commandOptions,
  options: readonly string[],
  paths: readonly string[] = [],
  { input = new Uint8Array(), index }: Extras = {},
): Promise<Buffer> {
  const pathsOnInput = readsPaths.has(command);

  const child = spawnProcess(
    "git",
    [
      "-c",
      "core.quotePath=false",
      // An empty unchanged line in a diff keeps its leading space.
      "-c",
      "diff.suppressBlankEmpty=false",
      // The repository's hooks, such as post-index-change, are for its own index.
      ...(index === undefined ? [] : ["-c", "core.hooksPath=/dev/null"]),
      // A path names a file, never a pattern such as `*` or `:!x`.
      "--literal-pathspecs",
      // Reading doesn't refresh the index, so it never holds the index lock while an agent's own
      // git command needs it.
      "--no-optional-locks",
      command,
      ...commandOptions[command],
      ...options,
      ...(pathsOnInput
        ? ["--pathspec-from-file=-", "--pathspec-file-nul", "--"]
        : ["--", ...paths]),
    ],
    {
      cwd: directory,
      // Stryker disable next-line StringLiteral: spawn pipes the streams anyway. "pipe" picks the overload whose type says so.
      stdio: "pipe",
      // Node leaves out a variable that's undefined: without an index of its own, git uses the
      // repository's.
      env: { ...process.env, GIT_INDEX_FILE: index },
    },
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
  child.stdin.end(pathsOnInput ? Buffer.from(paths.map((path) => `${path}\0`).join("")) : input);
  await once(child, "close");

  // `git diff --no-index` exits with 1 when the files differ, as --exit-code makes `git diff`, and
  // when a file is gone, which leaves the diff empty.
  const differs = options.includes("--no-index") && child.exitCode === 1;

  if (child.exitCode !== 0 && !differs) {
    throw new Error(`git ${command} failed: ${Buffer.concat(stderr).toString()}`);
  }

  return Buffer.concat(stdout);
}
