import { once } from "node:events";

import { spawnProcess } from "@getpaseo/plugin/server";

import { symlinksAmong } from "./symlinks";

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
  // Paths NUL-terminated and never quoted.
  "ls-files": ["-z"],
  "rev-parse": [],
  reset: [],
  restore: [],
  rm: [],
  // Deletes whatever clean.requireForce says.
  clean: ["--force"],
  // Paths, attributes and values NUL-terminated and never quoted, and with --stdin, paths read
  // NUL-terminated.
  "check-attr": ["-z"],
  // Paths read from its input and printed NUL-terminated, and never quoted.
  "check-ignore": ["-z", "--stdin"],
  config: [],
};

// Commands that read their paths from their input: as arguments, as many as a group of files can
// have would be more than a process can start with.
const readsPaths = new Set<keyof typeof commandOptions>(["add", "reset", "restore", "rm"]);

// Commands that take no paths: `git config` reads a `--` after its options as a value to look for.
const takesNoPaths = new Set<keyof typeof commandOptions>(["config"]);

// The pathspecs that name exactly the file at the path: never a pattern, such as `*` or `:!x`, and
// never the files in a directory of the same name, which git takes the path to name too, as where a
// directory has replaced the file. A path ending in `/`, as git status names a repository inside
// the repository, names the directory, a symlink has no files in it to leave out, and leaving the
// files in a submodule's directory out leaves the submodule out too.
function pathspecsOf(path: string, alone: boolean): string[] {
  return path.endsWith("/") || alone
    ? [`:(literal)${path}`]
    : [`:(literal)${path}`, `:(exclude,literal)${path}/`];
}

// The paths that are symlinks in the worktree, for `git add`, which refuses a pathspec beyond a
// symlink, even one that only leaves files out. The other commands still leave out the files under
// one, which HEAD or the index can have, as where a symlink has replaced a directory.
async function symlinksIn(
  directory: string,
  command: keyof typeof commandOptions,
  paths: readonly string[],
): Promise<Set<string>> {
  if (command !== "add") {
    return new Set();
  }

  const symlinks = await symlinksAmong(directory, paths);

  return symlinks;
}

// The pathspecs after the `--` that ends a command's options, for a command that takes paths.
function pathsAfter(command: keyof typeof commandOptions, pathspecs: readonly string[]): string[] {
  return takesNoPaths.has(command) ? [] : ["--", ...pathspecs];
}

interface Extras {
  // What the command reads, such as the patch `git apply` applies. A command that reads its paths
  // reads them in its place.
  input?: Uint8Array;
  // An index file the command uses in place of the repository's own.
  index?: string | undefined;
  // Stops the command, which then fails.
  signal?: AbortSignal | undefined;
  // The paths that are submodules'.
  submodules?: readonly string[] | undefined;
}

// Runs a git command and returns what it prints, as bytes: files, and so diffs, needn't be UTF-8.
export async function git(
  directory: string,
  command: keyof typeof commandOptions,
  options: readonly string[],
  paths: readonly string[] = [],
  { input = new Uint8Array(), index, signal, submodules }: Extras = {},
): Promise<Buffer> {
  const pathsOnInput = readsPaths.has(command);
  // `git diff --no-index` diffs files, which its paths name as they are.
  const noIndex = options.includes("--no-index");
  const symlinks = await symlinksIn(directory, command, paths);

  const pathspecs = noIndex
    ? paths
    : paths.flatMap((path) =>
        pathspecsOf(path, symlinks.has(path) || submodules?.includes(path) === true),
      );

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
      // Reading doesn't refresh the index, so it never holds the index lock while an agent's own
      // git command needs it.
      "--no-optional-locks",
      command,
      ...commandOptions[command],
      ...options,
      ...(pathsOnInput
        ? ["--pathspec-from-file=-", "--pathspec-file-nul", "--"]
        : pathsAfter(command, pathspecs)),
    ],
    {
      cwd: directory,
      // Stryker disable next-line StringLiteral: spawn pipes the streams anyway. "pipe" picks the overload whose type says so.
      stdio: "pipe",
      // Node leaves out a variable that's undefined. Whatever the environment the daemon started in
      // says, as a git hook's would, git finds the repository, its worktree and its objects from the
      // directory, and without an index of its own uses the repository's. It reads the pathspecs'
      // `:(literal)` and `:(exclude)`, and matches their case, as they are.
      env: {
        ...process.env,
        GIT_DIR: undefined,
        GIT_WORK_TREE: undefined,
        GIT_COMMON_DIR: undefined,
        GIT_OBJECT_DIRECTORY: undefined,
        GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined,
        GIT_INDEX_FILE: index,
        GIT_LITERAL_PATHSPECS: undefined,
        GIT_ICASE_PATHSPECS: undefined,
      },
      signal,
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
  child.stdin.end(
    pathsOnInput ? Buffer.from(pathspecs.map((pathspec) => `${pathspec}\0`).join("")) : input,
  );
  await once(child, "close");

  // `git diff --no-index` exits with 1 when the files differ, as --exit-code makes `git diff`, and
  // when a file is gone, which leaves the diff empty. `git check-ignore` exits with 1 when it
  // ignores none of the paths, and `git config` when the config doesn't set what it looks for.
  const answered =
    (noIndex || command === "check-ignore" || command === "config") && child.exitCode === 1;

  if (child.exitCode !== 0 && !answered) {
    throw new Error(`git ${command} failed: ${Buffer.concat(stderr).toString()}`);
  }

  return Buffer.concat(stdout);
}
