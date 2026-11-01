import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

// Sets up repositories and checks results without going through server/git.ts. `input` answers
// an interactive command's questions.
export function runGit(repository: string, args: readonly string[], input = ""): string {
  return execFileSync("git", ["--literal-pathspecs", ...args], {
    cwd: repository,
    encoding: "utf8",
    input,
    stdio: "pipe",
  });
}

// What git prints, as bytes: a diff of files that aren't UTF-8 has bytes that aren't either.
// `input` is what the command reads.
export function runGitBytes(repository: string, args: readonly string[], input = ""): Buffer {
  return execFileSync("git", ["--literal-pathspecs", ...args], {
    cwd: repository,
    input,
    stdio: "pipe",
  });
}

// Runs `git diff --no-index`, which exits with 1 where the files differ, and returns what it prints.
export function diffNoIndex(repository: string, from: string, to: string): Buffer {
  return spawnSync("git", ["--literal-pathspecs", "diff", "--no-index", "--", from, to], {
    cwd: repository,
  }).stdout;
}

// For a property test whose runs each set up a repository, which takes git about 100ms.
export const timeout = 60_000;

// Runs the test in a temporary directory, removed afterwards.
async function inDirectory(test: (directory: string) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "better-diff-"));

  try {
    await test(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

interface Entry {
  path: string;
  // Undefined for a directory.
  content: Buffer | undefined;
}

// Each directory and file of an empty repository, as `git init` makes it without the sample hooks.
// A directory comes before what's in it.
let emptyRepository: Entry[] | undefined;

function readEmptyRepository(): Entry[] {
  const made = mkdtempSync(join(tmpdir(), "better-diff-"));

  try {
    runGit(made, ["init", "--quiet", "--template="]);

    return readdirSync(made, { recursive: true, withFileTypes: true }).map((entry) => {
      const path = join(relative(made, entry.parentPath), entry.name);

      return { path, content: entry.isDirectory() ? undefined : readFileSync(join(made, path)) };
    });
  } finally {
    rmSync(made, { recursive: true, force: true });
  }
}

// Writes out what `git init` makes in a fraction of the time it takes, having read it the first
// time.
function writeEmptyRepository(repository: string): void {
  emptyRepository ??= readEmptyRepository();

  for (const { path, content } of emptyRepository) {
    if (content === undefined) {
      mkdirSync(join(repository, path));
    } else {
      writeFileSync(join(repository, path), content);
    }
  }
}

export async function inRepository(test: (repository: string) => Promise<void>): Promise<void> {
  await inDirectory(async (repository) => {
    writeEmptyRepository(repository);
    await test(repository);
  });
}

// Runs the test in a copy of the repository, its index and worktree included.
export async function inCopyOf(
  repository: string,
  test: (copy: string) => Promise<void>,
): Promise<void> {
  await inDirectory(async (copy) => {
    // A symlink's target as it is, not resolved to the absolute path of what it points to.
    cpSync(repository, copy, { recursive: true, verbatimSymlinks: true });
    await test(copy);
  });
}

export function commitAll(repository: string): void {
  runGit(repository, ["add", "--all"]);
  runGit(repository, ["commit", "--quiet", "--message", "Commit"]);
}

export function writeFile(repository: string, path: string, content: string | Uint8Array): void {
  const file = join(repository, path);

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

export function writeSymlink(repository: string, path: string, target: string): void {
  symlinkSync(target, join(repository, path));
}

export function deleteFile(repository: string, path: string): void {
  rmSync(join(repository, path), { force: true });
}

export function makeExecutable(repository: string, path: string): void {
  chmodSync(join(repository, path), 0o755);
}

// Undefined if the worktree doesn't have the file.
export function worktreeFile(repository: string, path: string): Buffer | undefined {
  const file = join(repository, path);

  return existsSync(file) ? readFileSync(file) : undefined;
}

// Undefined if the index doesn't have the file.
export function indexFile(repository: string, path: string): Buffer | undefined {
  // `:0:<path>` names the file in the index. git answers `<blob> blob <size>\n<content>\n`, or
  // `<name> missing\n` if the index doesn't have it: only the name starts with `:`.
  const output = runGitBytes(repository, ["cat-file", "--batch", "-z"], `:0:${path}\0`);

  return output.toString("latin1").startsWith(":")
    ? undefined
    : output.subarray(output.indexOf("\n") + 1, -1);
}
