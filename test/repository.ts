import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

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
export function runGitBytes(repository: string, args: readonly string[]): Buffer {
  return execFileSync("git", ["--literal-pathspecs", ...args], { cwd: repository, stdio: "pipe" });
}

// For a property test whose runs each set up a repository, which takes git about 100ms.
export const timeout = 60_000;

export async function inRepository(test: (repository: string) => Promise<void>): Promise<void> {
  const repository = mkdtempSync(join(tmpdir(), "better-diff-"));

  try {
    runGit(repository, ["init", "--quiet"]);
    await test(repository);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
}

export function writeFile(repository: string, path: string, content: string | Uint8Array): void {
  const file = join(repository, path);

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

export function deleteFile(repository: string, path: string): void {
  rmSync(join(repository, path), { force: true });
}

export function worktreeFile(repository: string, path: string): Buffer {
  return readFileSync(join(repository, path));
}

export function indexFile(repository: string, path: string): Buffer {
  // An entry reads `<mode> <blob> <stage>\t<path>`.
  const [, blob = ""] = runGit(repository, ["ls-files", "--stage", "-z", "--", path]).split(" ");

  return runGitBytes(repository, ["cat-file", "blob", blob]);
}
